// The Android host of SweMed: an activity with one WebView per site and the app's own page (../web) for the toolbar
// and views. See ../README.md.
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode = RepositoriesMode.FAIL_ON_PROJECT_REPOS
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "swemed"
include(":app")
