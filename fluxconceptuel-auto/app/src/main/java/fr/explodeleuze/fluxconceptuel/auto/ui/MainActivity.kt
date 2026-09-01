package fr.explodeleuze.fluxconceptuel.auto.ui

import android.Manifest
import android.content.ComponentName
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.media3.common.MediaItem
import androidx.media3.session.MediaBrowser
import androidx.media3.session.SessionToken
import fr.explodeleuze.fluxconceptuel.auto.playback.PlaybackService
import kotlinx.coroutines.guava.await
import kotlinx.coroutines.launch

private val Night = Color(0xFF0F1216)
private val Panel = Color(0xFF12171D)
private val Steel = Color(0xFF5980A6)
private val Gold = Color(0xFFE8C15A)
private val Dim = Color(0xFF8FA0B0)

/**
 * UI téléphone minimale : parcourir le même arbre qu'Android Auto et lancer la
 * lecture. Utile pour tester sans voiture ni Desktop Head Unit.
 */
class MainActivity : ComponentActivity() {

    private var browser: MediaBrowser? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            MaterialTheme(colorScheme = darkColorScheme(primary = Steel, background = Night, surface = Night)) {
                Surface(color = Night) { BrowseScreen() }
            }
        }
    }

    override fun onDestroy() {
        browser?.release()
        browser = null
        super.onDestroy()
    }

    private suspend fun awaitBrowser(): MediaBrowser {
        browser?.let { return it }
        val token = SessionToken(this, ComponentName(this, PlaybackService::class.java))
        return MediaBrowser.Builder(this, token).buildAsync().await().also { browser = it }
    }

    @OptIn(ExperimentalMaterial3Api::class)
    @Composable
    private fun BrowseScreen() {
        val scope = rememberCoroutineScope()

        // notification de lecture (Android 13+)
        val notifPermission = rememberLauncherForActivityResult(
            ActivityResultContracts.RequestPermission()
        ) { /* accordé ou non : la lecture marche quand même */ }
        LaunchedEffect(Unit) {
            if (Build.VERSION.SDK_INT >= 33) notifPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }

        var path by remember { mutableStateOf<List<MediaItem>>(emptyList()) }
        var children by remember { mutableStateOf<List<MediaItem>>(emptyList()) }
        var loading by remember { mutableStateOf(true) }
        var error by remember { mutableStateOf<String?>(null) }
        var nowPlaying by remember { mutableStateOf<String?>(null) }

        suspend fun open(parentId: String?) {
            loading = true; error = null
            try {
                val b = awaitBrowser()
                val id = parentId ?: b.getLibraryRoot(null).await().value!!.mediaId
                children = b.getChildren(id, 0, 200, null).await().value?.toList().orEmpty()
            } catch (e: Exception) {
                error = "Contenu indisponible — vérifiez la connexion."
                children = emptyList()
            } finally {
                loading = false
            }
        }

        fun play(item: MediaItem) = scope.launch {
            val b = awaitBrowser()
            b.setMediaItem(item); b.prepare(); b.play()
            nowPlaying = item.mediaMetadata.title?.toString()
        }

        LaunchedEffect(Unit) { open(null) }

        Column(Modifier.fillMaxSize().statusBarsPadding()) {
            TopAppBar(
                title = {
                    Text(
                        path.lastOrNull()?.mediaMetadata?.title?.toString() ?: "Flux Conceptuel",
                        maxLines = 1, overflow = TextOverflow.Ellipsis,
                    )
                },
                navigationIcon = {
                    if (path.isNotEmpty()) IconButton(onClick = {
                        val parent = path.dropLast(1)
                        path = parent
                        scope.launch { open(parent.lastOrNull()?.mediaId) }
                    }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Retour") }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Night, titleContentColor = Color.White, navigationIconContentColor = Steel,
                ),
            )

            when {
                loading -> Box(Modifier.fillMaxSize(), Alignment.Center) { CircularProgressIndicator(color = Steel) }
                error != null -> Box(Modifier.fillMaxSize().padding(24.dp), Alignment.Center) { Text(error!!, color = Dim) }
                else -> LazyColumn(Modifier.weight(1f)) {
                    items(children, key = { it.mediaId }) { item ->
                        val md = item.mediaMetadata
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .clickable {
                                    if (md.isBrowsable == true) {
                                        path = path + item
                                        scope.launch { open(item.mediaId) }
                                    } else {
                                        play(item)
                                    }
                                }
                                .padding(horizontal = 16.dp, vertical = 14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(md.title?.toString().orEmpty(), color = Color.White, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                md.subtitle?.let { Text(it.toString(), color = Dim, maxLines = 1, overflow = TextOverflow.Ellipsis) }
                            }
                            if (md.isPlayable == true) {
                                IconButton(onClick = { play(item) }) {
                                    Icon(Icons.Default.PlayArrow, "Lire", tint = Gold)
                                }
                            }
                        }
                        HorizontalDivider(color = Color(0x22FFFFFF))
                    }
                }
            }

            nowPlaying?.let {
                Surface(color = Panel, tonalElevation = 4.dp) {
                    Text(
                        "▶  $it", color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.fillMaxWidth().padding(16.dp).navigationBarsPadding(),
                    )
                }
            }
        }
    }
}
