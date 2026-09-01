# kotlinx.serialization — garder les serializers générés
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**
-keepclassmembers class **$$serializer { *; }
-keepclasseswithmembers class fr.explodeleuze.fluxconceptuel.auto.api.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class fr.explodeleuze.fluxconceptuel.auto.api.**$$serializer { *; }
-keep class fr.explodeleuze.fluxconceptuel.auto.api.** { <fields>; }

# Retrofit
-keep,allowobfuscation,allowshrinking interface retrofit2.Call
-keep,allowobfuscation,allowshrinking class retrofit2.Response
-keepattributes Signature, Exceptions
-if interface * { @retrofit2.http.* <methods>; }
-keep,allowobfuscation interface <1>

# Media3 garde ses composants réflexifs
-dontwarn com.google.errorprone.annotations.**
