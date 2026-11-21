plugins {
    id("com.android.application")
}

android {
    namespace = "se.sthlm_med.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "se.sthlm_med.app"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.5.0"
    }

    /*
     * The debug keystore named in ~/.gradle/gradle.properties (DEBUG_STORE_FILE, DEBUG_STORE_PASS, DEBUG_KEY_ALIAS,
     * DEBUG_KEY_PASS), so every machine signs debug builds with the same key; without it, Android's default debug key.
     */
    val debugStore = findProperty("DEBUG_STORE_FILE") as String?
    if (debugStore != null) {
        signingConfigs.getByName("debug") {
            storeFile = file(debugStore)
            storePassword = findProperty("DEBUG_STORE_PASS") as String?
            keyAlias = findProperty("DEBUG_KEY_ALIAS") as String?
            keyPassword = findProperty("DEBUG_KEY_PASS") as String?
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.activity:activity:1.13.0")
    implementation("androidx.core:core-ktx:1.18.0")
    implementation("androidx.webkit:webkit:1.18.0")
    testImplementation("junit:junit:4.13.2")
    // Android's org.json is a stub on the JVM; unit tests of the message format need a real one.
    testImplementation("org.json:json:20260814")
}

/*
 * The app's page: ../web compiled by `npm run build` into web/dist, which is bundled as the APK's assets. Every build
 * starts with it (preBuild), and it runs again only when the page's sources have changed.
 */
val webDir: File = rootProject.file("../web")

val buildWeb = tasks.register<Exec>("buildWeb") {
    val app_version = android.defaultConfig.versionName.orEmpty()
    description = "Compiles the web app in ../web (npm run build)."
    workingDir = webDir
    environment("STHLM_MED_VERSION", app_version)
    commandLine(if (System.getProperty("os.name").startsWith("Windows")) "npm.cmd" else "npm", "run", "build")
    inputs.property("app_version", app_version)
    inputs.dir(webDir.resolve("src"))
    inputs.dir(webDir.resolve("static"))
    inputs.dir(webDir.resolve("scripts"))
    inputs.file(webDir.resolve("package.json"))
    inputs.file(webDir.resolve("tsconfig.json"))
    outputs.dir(webDir.resolve("dist"))
}

android.sourceSets["main"].assets.srcDir(webDir.resolve("dist"))
tasks.named("preBuild") { dependsOn(buildWeb) }
