package fr.explodeleuze.fluxconceptuel.auto.api

import kotlinx.serialization.Serializable

/** Réponses de l'API de diffusion (api/main.py). Champs inconnus ignorés. */

@Serializable
data class Theme(
    val theme: String,
    val seance_count: Int = 0,
)

@Serializable
data class Seance(
    val id: Int,
    val titre: String? = null,
    val theme: String? = null,
    val promo: String? = null,
    val num: Int? = null,
    val date: String? = null,
    val source: String? = null,
    val ref: String? = null,
    val sujets: List<String> = emptyList(),
    val frag_count: Int = 0,
    val fragments: List<Fragment> = emptyList(),
)

@Serializable
data class Fragment(
    val id: Int,
    val idConf: Int = 0,
    val idFrag: Int? = null,
    val conf_titre: String? = null,
    val conf_theme: String? = null,
    val conf_num: Int? = null,
    val texte: String = "",
    val start: Double = 0.0,
    val end: Double = 0.0,
    val audio_file: String = "",
    val audio_url: String = "",
    val timecode: String? = null,
    val concepts: List<String> = emptyList(),
)

@Serializable
data class SearchResponse(
    val hits: List<Fragment> = emptyList(),
    val estimatedTotalHits: Int = 0,
)
