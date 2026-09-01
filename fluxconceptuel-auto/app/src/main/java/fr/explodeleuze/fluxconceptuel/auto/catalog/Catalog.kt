package fr.explodeleuze.fluxconceptuel.auto.catalog

import android.net.Uri
import android.os.Bundle
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import fr.explodeleuze.fluxconceptuel.auto.api.ApiClient
import fr.explodeleuze.fluxconceptuel.auto.api.FluxApi
import fr.explodeleuze.fluxconceptuel.auto.api.Fragment
import fr.explodeleuze.fluxconceptuel.auto.api.Seance
import fr.explodeleuze.fluxconceptuel.auto.api.Theme
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.net.URLDecoder
import java.net.URLEncoder

/** Identifiants des nœuds de l'arbre média exposé à Android Auto. */
object MediaIds {
    const val ROOT = "[root]"
    fun theme(name: String): String = "theme/" + URLEncoder.encode(name, "UTF-8")
    fun seance(id: Int): String = "seance/$id"
    fun fragment(seanceId: Int, fragId: Int): String = "frag/$seanceId/$fragId"

    fun isTheme(id: String) = id.startsWith("theme/")
    fun isSeance(id: String) = id.startsWith("seance/")
    fun isFragment(id: String) = id.startsWith("frag/")

    fun themeName(id: String): String = URLDecoder.decode(id.removePrefix("theme/"), "UTF-8")
    fun seanceId(id: String): Int = id.removePrefix("seance/").toInt()
    fun fragmentSeanceId(id: String): Int = id.removePrefix("frag/").substringBefore('/').toInt()
    fun fragmentFragId(id: String): Int = id.substringAfterLast('/').toInt()
}

private const val CONTENT_STYLE_BROWSABLE_HINT = "android.media.browse.CONTENT_STYLE_BROWSABLE_HINT"
private const val CONTENT_STYLE_PLAYABLE_HINT = "android.media.browse.CONTENT_STYLE_PLAYABLE_HINT"
private const val CONTENT_STYLE_LIST_ITEM = 1

/**
 * Accès au catalogue via l'API, avec un cache mémoire minimal (les données
 * bougent rarement ; l'arbre Android Auto doit répondre vite). Construit aussi
 * les `MediaItem` — browsables pour la navigation, playables pour la lecture.
 */
class Catalog(private val api: FluxApi) {

    private val lock = Mutex()
    private var themesCache: List<Theme>? = null
    private val seancesByTheme = HashMap<String, List<Seance>>()
    private val seanceById = HashMap<Int, Seance>()

    suspend fun themes(): List<Theme> = lock.withLock {
        themesCache ?: api.themes().also { themesCache = it }
    }

    suspend fun seances(theme: String): List<Seance> = lock.withLock {
        seancesByTheme[theme] ?: api.seances(theme).also { seancesByTheme[theme] = it }
    }

    /** Séance complète, fragments triés dans l'ordre de lecture (`id` = idTrans). */
    suspend fun seance(id: Int): Seance = lock.withLock {
        seanceById[id] ?: api.seance(id)
            .let { it.copy(fragments = it.fragments.sortedBy { f -> f.id }) }
            .also { seanceById[id] = it }
    }

    suspend fun search(query: String): List<Fragment> =
        api.search(query).hits

    // ---------------------------------------------------------------- arbre

    fun rootItem(): MediaItem = browsable(
        id = MediaIds.ROOT,
        title = "Flux Conceptuel",
        mediaType = MediaMetadata.MEDIA_TYPE_FOLDER_MIXED,
    )

    suspend fun rootChildren(): List<MediaItem> = themes().map { t ->
        browsable(
            id = MediaIds.theme(t.theme),
            title = t.theme,
            subtitle = "${t.seance_count} séance${if (t.seance_count > 1) "s" else ""}",
            mediaType = MediaMetadata.MEDIA_TYPE_FOLDER_MIXED,
        )
    }

    suspend fun themeChildren(themeName: String): List<MediaItem> =
        seances(themeName).map { seanceBrowsableItem(it) }

    suspend fun seanceChildren(seanceId: Int): List<MediaItem> =
        seance(seanceId).let { s -> s.fragments.map { fragmentItem(s, it, playableUri = true) } }

    /** Playlist résolue (avec URIs) d'une séance, prête pour ExoPlayer. */
    suspend fun seancePlaylist(seanceId: Int): List<MediaItem> = seanceChildren(seanceId)

    suspend fun searchItems(query: String): List<MediaItem> {
        val hits = search(query)
        // regroupées par séance pour construire des playlists cohérentes
        return hits.map { f ->
            val pseudo = Seance(id = f.idConf, titre = f.conf_titre, theme = f.conf_theme, num = f.conf_num)
            fragmentItem(pseudo, f, playableUri = true)
        }
    }

    // ------------------------------------------------------------- mappers

    private fun seanceBrowsableItem(s: Seance): MediaItem {
        val title = s.titre ?: "Séance ${s.num ?: ""}".trim()
        return MediaItem.Builder()
            .setMediaId(MediaIds.seance(s.id))
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle(title)
                    .setSubtitle(s.theme)
                    .setArtist(s.theme)
                    .setIsBrowsable(true)     // on peut lister les fragments
                    .setIsPlayable(true)      // …ou lancer toute la séance
                    .setMediaType(MediaMetadata.MEDIA_TYPE_MUSIC)
                    .setExtras(contentStyle())
                    .build()
            )
            .build()
    }

    private fun fragmentItem(s: Seance, f: Fragment, playableUri: Boolean): MediaItem {
        val hms = hms(f.start)
        val snippet = f.texte.take(80).let { if (f.texte.length > 80) "$it…" else it }
        val builder = MediaItem.Builder()
            .setMediaId(MediaIds.fragment(s.id, f.id))
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle("$hms — $snippet")
                    .setSubtitle(s.titre ?: s.theme)
                    .setArtist(s.titre ?: "Flux Conceptuel")
                    .setAlbumTitle(s.theme)
                    .setIsBrowsable(false)
                    .setIsPlayable(true)
                    .setMediaType(MediaMetadata.MEDIA_TYPE_MUSIC)
                    .build()
            )
        if (playableUri && f.audio_file.isNotEmpty()) {
            val uri = Uri.parse(ApiClient.audioUrl(f.audio_file))
            builder.setUri(uri)
            builder.setRequestMetadata(
                MediaItem.RequestMetadata.Builder().setMediaUri(uri).build()
            )
        }
        return builder.build()
    }

    private fun browsable(
        id: String,
        title: String,
        subtitle: String? = null,
        mediaType: Int,
    ): MediaItem = MediaItem.Builder()
        .setMediaId(id)
        .setMediaMetadata(
            MediaMetadata.Builder()
                .setTitle(title)
                .setSubtitle(subtitle)
                .setIsBrowsable(true)
                .setIsPlayable(false)
                .setMediaType(mediaType)
                .setExtras(contentStyle())
                .build()
        )
        .build()

    /** Android Auto : affichage en liste (contenu très textuel). Clés du contrat
     *  legacy `android.media.browse.*`, lues via les extras de MediaMetadata. */
    private fun contentStyle() = Bundle().apply {
        putInt(CONTENT_STYLE_BROWSABLE_HINT, CONTENT_STYLE_LIST_ITEM)
        putInt(CONTENT_STYLE_PLAYABLE_HINT, CONTENT_STYLE_LIST_ITEM)
    }

    private fun hms(seconds: Double): String {
        val s = seconds.toInt()
        val h = s / 3600; val m = (s % 3600) / 60; val sec = s % 60
        return if (h > 0) "%d:%02d:%02d".format(h, m, sec) else "%02d:%02d".format(m, sec)
    }
}
