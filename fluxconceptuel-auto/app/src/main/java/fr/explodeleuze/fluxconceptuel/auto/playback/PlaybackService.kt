package fr.explodeleuze.fluxconceptuel.auto.playback

import android.app.PendingIntent
import android.content.Intent
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaLibraryService
import androidx.media3.session.MediaLibraryService.MediaLibrarySession
import androidx.media3.session.MediaSession
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import fr.explodeleuze.fluxconceptuel.auto.api.ApiClient
import fr.explodeleuze.fluxconceptuel.auto.catalog.Catalog
import fr.explodeleuze.fluxconceptuel.auto.catalog.MediaIds
import fr.explodeleuze.fluxconceptuel.auto.ui.MainActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.guava.future

/**
 * Service média : c'est lui qu'Android Auto (et l'Assistant, Wear OS…)
 * interrogent. Il expose l'arbre du catalogue et pilote un ExoPlayer.
 */
class PlaybackService : MediaLibraryService() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private lateinit var player: ExoPlayer
    private lateinit var session: MediaLibrarySession
    private lateinit var catalog: Catalog
    private lateinit var resume: ResumeStore

    override fun onCreate() {
        super.onCreate()
        catalog = Catalog(ApiClient.create(this))
        resume = ResumeStore(this)

        val httpFactory = OkHttpDataSource.Factory(ApiClient.okHttp(this))

        player = ExoPlayer.Builder(this)
            .setAudioAttributes(AudioAttributes.DEFAULT, /* handleAudioFocus = */ true)
            .setHandleAudioBecomingNoisy(true)
            .setMediaSourceFactory(DefaultMediaSourceFactory(httpFactory))
            .build()
            .apply { addListener(PositionSaver()) }

        val openApp = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )

        session = MediaLibrarySession.Builder(this, player, LibraryCallback())
            .setSessionActivity(openApp)
            .build()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo) = session

    override fun onTaskRemoved(rootIntent: Intent?) {
        if (!player.playWhenReady || player.mediaItemCount == 0) stopSelf()
    }

    override fun onDestroy() {
        session.release()
        player.release()
        scope.cancel()
        super.onDestroy()
    }

    // ------------------------------------------------------------- callback

    private inner class LibraryCallback : MediaLibrarySession.Callback {

        override fun onGetLibraryRoot(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            params: LibraryParams?,
        ): ListenableFuture<LibraryResult<MediaItem>> =
            Futures.immediateFuture(LibraryResult.ofItem(catalog.rootItem(), params))

        override fun onGetChildren(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            parentId: String,
            page: Int,
            pageSize: Int,
            params: LibraryParams?,
        ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> = scope.future {
            runCatching {
                val items = when {
                    parentId == MediaIds.ROOT -> catalog.rootChildren()
                    MediaIds.isTheme(parentId) -> catalog.themeChildren(MediaIds.themeName(parentId))
                    MediaIds.isSeance(parentId) -> catalog.seanceChildren(MediaIds.seanceId(parentId))
                    else -> emptyList()
                }
                LibraryResult.ofItemList(items, params)
            }.getOrElse { LibraryResult.ofError(LibraryResult.RESULT_ERROR_IO) }
        }

        override fun onGetItem(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            mediaId: String,
        ): ListenableFuture<LibraryResult<MediaItem>> = scope.future {
            runCatching {
                val item = when {
                    mediaId == MediaIds.ROOT -> catalog.rootItem()
                    MediaIds.isTheme(mediaId) ->
                        catalog.rootChildren().firstOrNull { it.mediaId == mediaId }
                    MediaIds.isSeance(mediaId) -> {
                        val sid = MediaIds.seanceId(mediaId)
                        val theme = catalog.seance(sid).theme
                        theme?.let { catalog.themeChildren(it).firstOrNull { i -> i.mediaId == mediaId } }
                    }
                    MediaIds.isFragment(mediaId) ->
                        catalog.seanceChildren(MediaIds.fragmentSeanceId(mediaId))
                            .firstOrNull { it.mediaId == mediaId }
                    else -> null
                }
                item?.let { LibraryResult.ofItem(it, null) }
                    ?: LibraryResult.ofError(LibraryResult.RESULT_ERROR_BAD_VALUE)
            }.getOrElse { LibraryResult.ofError(LibraryResult.RESULT_ERROR_IO) }
        }

        override fun onSearch(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            query: String,
            params: LibraryParams?,
        ): ListenableFuture<LibraryResult<Void>> = scope.future {
            runCatching {
                val n = catalog.search(query).size
                session.notifySearchResultChanged(browser, query, n, params)
                LibraryResult.ofVoid()
            }.getOrElse { LibraryResult.ofError(LibraryResult.RESULT_ERROR_IO) }
        }

        override fun onGetSearchResult(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            query: String,
            page: Int,
            pageSize: Int,
            params: LibraryParams?,
        ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> = scope.future {
            runCatching {
                LibraryResult.ofItemList(catalog.searchItems(query), params)
            }.getOrElse { LibraryResult.ofError(LibraryResult.RESULT_ERROR_IO) }
        }

        override fun onAddMediaItems(
            mediaSession: MediaSession,
            controller: MediaSession.ControllerInfo,
            mediaItems: MutableList<MediaItem>,
        ): ListenableFuture<MutableList<MediaItem>> = scope.future {
            mediaItems.map { resolve(it) }.toMutableList()
        }

        override fun onSetMediaItems(
            mediaSession: MediaSession,
            controller: MediaSession.ControllerInfo,
            mediaItems: MutableList<MediaItem>,
            startIndex: Int,
            startPositionMs: Long,
        ): ListenableFuture<MediaSession.MediaItemsWithStartPosition> = scope.future {
            // 1) recherche vocale : « joue X sur Flux Conceptuel »
            val q = mediaItems.singleOrNull()?.requestMetadata?.searchQuery
            if (!q.isNullOrBlank()) {
                val items = catalog.searchItems(q.toString())
                return@future MediaSession.MediaItemsWithStartPosition(items, 0, C.TIME_UNSET)
            }
            // 2) un nœud de l'arbre → on déplie en playlist
            if (mediaItems.size == 1) {
                val id = mediaItems[0].mediaId
                when {
                    MediaIds.isSeance(id) -> {
                        val pl = catalog.seancePlaylist(MediaIds.seanceId(id))
                        return@future MediaSession.MediaItemsWithStartPosition(pl, 0, C.TIME_UNSET)
                    }
                    MediaIds.isFragment(id) -> {
                        val pl = catalog.seancePlaylist(MediaIds.fragmentSeanceId(id))
                        val i = pl.indexOfFirst { it.mediaId == id }.coerceAtLeast(0)
                        return@future MediaSession.MediaItemsWithStartPosition(pl, i, C.TIME_UNSET)
                    }
                }
            }
            // 3) sinon : compléter les URIs 1:1
            val resolved = mediaItems.map { resolve(it) }
            MediaSession.MediaItemsWithStartPosition(resolved, startIndex, startPositionMs)
        }

        override fun onPlaybackResumption(
            mediaSession: MediaSession,
            controller: MediaSession.ControllerInfo,
        ): ListenableFuture<MediaSession.MediaItemsWithStartPosition> = scope.future {
            val saved = resume.load() ?: throw UnsupportedOperationException("rien à reprendre")
            val pl = catalog.seancePlaylist(saved.seanceId)
            if (pl.isEmpty()) throw UnsupportedOperationException("séance vide")
            val i = pl.indexOfFirst { it.mediaId == saved.mediaId }.coerceAtLeast(0)
            MediaSession.MediaItemsWithStartPosition(pl, i, saved.positionMs)
        }
    }

    /** Complète une URI manquante pour un item venu de la navigation. */
    private suspend fun resolve(item: MediaItem): MediaItem {
        if (item.localConfiguration != null) return item
        val id = item.mediaId
        if (MediaIds.isFragment(id)) {
            catalog.seancePlaylist(MediaIds.fragmentSeanceId(id))
                .firstOrNull { it.mediaId == id }?.let { return it }
        }
        if (MediaIds.isSeance(id)) {
            catalog.seancePlaylist(MediaIds.seanceId(id)).firstOrNull()?.let { return it }
        }
        return item
    }

    private inner class PositionSaver : Player.Listener {
        override fun onIsPlayingChanged(isPlaying: Boolean) { if (!isPlaying) save() }
        override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) { save() }

        private fun save() {
            val cur = player.currentMediaItem ?: return
            val id = cur.mediaId
            val sid = when {
                MediaIds.isFragment(id) -> MediaIds.fragmentSeanceId(id)
                MediaIds.isSeance(id) -> MediaIds.seanceId(id)
                else -> return
            }
            resume.save(ResumeStore.Saved(sid, id, player.currentPosition))
        }
    }
}
