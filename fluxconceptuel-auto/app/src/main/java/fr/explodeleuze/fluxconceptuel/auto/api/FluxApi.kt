package fr.explodeleuze.fluxconceptuel.auto.api

import retrofit2.http.GET
import retrofit2.http.Path
import retrofit2.http.Query

interface FluxApi {

    @GET("api/themes")
    suspend fun themes(): List<Theme>

    @GET("api/themes/{theme}/seances")
    suspend fun seances(@Path("theme", encoded = false) theme: String): List<Seance>

    @GET("api/seances/{id}")
    suspend fun seance(@Path("id") id: Int): Seance

    @GET("api/search")
    suspend fun search(
        @Query("q") q: String,
        @Query("limit") limit: Int = 40,
    ): SearchResponse
}
