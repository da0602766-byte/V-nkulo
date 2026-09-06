plugins { id("com.android.application") }

android {
    namespace = "com.vinkulo.app"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.vinkulo.app"
        minSdk = 24
        targetSdk = 35
        versionCode = 6
        versionName = "1.5.0"
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
}

dependencies {
    implementation("androidx.browser:browser:1.8.0")
}
