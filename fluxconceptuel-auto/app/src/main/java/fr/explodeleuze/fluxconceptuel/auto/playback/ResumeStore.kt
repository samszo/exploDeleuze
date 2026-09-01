package fr.explodeleuze.fluxconceptuel.auto.playback

import android.content.Context

/** Dernière position de lecture, pour « Reprendre » (Android Auto onPlaybackResumption). */
class ResumeStore(context: Context) {

    data class Saved(val seanceId: Int, val mediaId: String, val positionMs: Long)

    private val prefs = context.getSharedPreferences("resume", Context.MODE_PRIVATE)

    fun save(s: Saved) = prefs.edit()
        .putInt("seanceId", s.seanceId)
        .putString("mediaId", s.mediaId)
        .putLong("positionMs", s.positionMs)
        .apply()

    fun load(): Saved? {
        val sid = prefs.getInt("seanceId", -1)
        val mid = prefs.getString("mediaId", null)
        if (sid < 0 || mid == null) return null
        return Saved(sid, mid, prefs.getLong("positionMs", 0L))
    }
}
