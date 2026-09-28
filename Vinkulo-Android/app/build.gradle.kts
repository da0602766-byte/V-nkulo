plugins {
    id("com.android.application")
    id("com.google.gms.google-services")
}

val productionStorePath = providers.environmentVariable("VINKULO_SIGNING_STORE_FILE").orNull
val productionStorePassword = providers.environmentVariable("VINKULO_SIGNING_PASSWORD").orNull

android {
    namespace = "com.vinkulo.app"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.vinkulo.app"
        minSdk = 24
        targetSdk = 35
        versionCode = 18
        versionName = "1.15.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        javaCompileOptions {
            annotationProcessorOptions {
                arguments["room.schemaLocation"] = "$projectDir/schemas"
            }
        }
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
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    buildFeatures { buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.browser:browser:1.8.0")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation(platform("com.google.firebase:firebase-bom:33.9.0"))
    implementation("com.google.firebase:firebase-messaging")
    implementation("androidx.room:room-runtime:2.6.1")
    implementation("androidx.work:work-runtime:2.9.1")
    annotationProcessor("androidx.room:room-compiler:2.6.1")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test:core:1.6.1")
    androidTestImplementation("androidx.test.uiautomator:uiautomator:2.3.0")
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
