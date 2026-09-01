package fr.explodeleuze.fluxconceptuel.auto.api

import android.content.Context
import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import fr.explodeleuze.fluxconceptuel.auto.BuildConfig
import kotlinx.serialization.json.Json
import okhttp3.Cache
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import java.util.concurrent.TimeUnit

/** Client HTTP unique, partagé par Retrofit (catalogue JSON) et Media3 (audio). */
object ApiClient {

    private val json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
    }

    @Volatile private var http: OkHttpClient? = null

    fun okHttp(context: Context): OkHttpClient = http ?: synchronized(this) {
        http ?: OkHttpClient.Builder()
            .cache(Cache(context.applicationContext.cacheDir.resolve("http"), 10L * 1024 * 1024))
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .addInterceptor(HttpLoggingInterceptor().apply {
                level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BASIC
                else HttpLoggingInterceptor.Level.NONE
            })
            .build()
            .also { http = it }
    }

    fun create(context: Context): FluxApi =
        Retrofit.Builder()
            .baseUrl(BuildConfig.API_BASE)
            .client(okHttp(context))
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(FluxApi::class.java)

    /** URL absolue d'un fichier audio à partir de son nom (`audio_file`). */
    fun audioUrl(audioFile: String): String =
        BuildConfig.API_BASE.trimEnd('/') + "/audio/" + audioFile
}
