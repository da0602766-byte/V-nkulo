plugins { id("com.android.application") }

val productionStorePath = providers.environmentVariable("VINKULO_SIGNING_STORE_FILE").orNull
val productionStorePassword = providers.environmentVariable("VINKULO_SIGNING_PASSWORD").orNull

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
    signingConfigs {
        if (!productionStorePath.isNullOrBlank() && !productionStorePassword.isNullOrBlank()) {
            create("production") {
                storeFile = file(productionStorePath)
                storePassword = productionStorePassword
                keyAlias = "vinkulo-release"
                keyPassword = productionStorePassword
                storeType = "PKCS12"
            }
        }
    }
    buildTypes {
        release {
            signingConfig = signingConfigs.findByName("production")
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
}

dependencies {
    implementation("androidx.browser:browser:1.8.0")
}

gradle.taskGraph.whenReady {
    val createsRelease = allTasks.any { task ->
        task.name.endsWith("Release", ignoreCase = true)
    }
    if (
        createsRelease &&
        (productionStorePath.isNullOrBlank() || productionStorePassword.isNullOrBlank())
    ) {
        throw GradleException(
            "A chave estável de produção é obrigatória para gerar o APK release.",
        )
    }
}
