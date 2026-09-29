use tauri::Url;

/// Keep the app's origin stable across releases so WebView storage survives updates.
pub fn is_app_url(url: &Url, dev_url: Option<&Url>) -> bool {
    let bundled = url.username().is_empty()
        && url.password().is_none()
        && url.port().is_none()
        && ((url.scheme() == "tauri" && url.host_str() == Some("localhost"))
            || (url.scheme() == "https" && url.host_str() == Some("tauri.localhost")));
    bundled
        || dev_url.is_some_and(|dev| {
            url.scheme() == dev.scheme()
                && url.host_str() == dev.host_str()
                && url.port_or_known_default() == dev.port_or_known_default()
                && url.username().is_empty()
                && url.password().is_none()
        })
}

pub fn is_external_url(url: &Url) -> bool {
    url.scheme() == "https"
        && url.host_str().is_some()
        && url.username().is_empty()
        && url.password().is_none()
        && !is_app_url(url, None)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_local_routes_and_only_the_configured_dev_origin() {
        let dev = Url::parse("http://localhost:3000").unwrap();
        for route in [
            "tauri://localhost/zh-CN/articles/?id=sample-morning",
            "https://tauri.localhost/ja/settings/",
        ] {
            assert!(is_app_url(&Url::parse(route).unwrap(), None));
        }
        assert!(is_app_url(
            &Url::parse("http://localhost:3000/en/").unwrap(),
            Some(&dev)
        ));
        for route in [
            "http://localhost:3001/",
            "https://localhost:3000/",
            "https://tauri.localhost.evil.example/",
            "tauri://evil.example/",
            "tauri://localhost:8000/",
            "https://user@tauri.localhost/",
        ] {
            assert!(
                !is_app_url(&Url::parse(route).unwrap(), Some(&dev)),
                "{route}"
            );
        }
        assert!(!is_app_url(&dev, None));
    }

    #[test]
    fn only_https_links_can_launch_the_system_browser() {
        assert!(is_external_url(
            &Url::parse("https://github.com/Altria1979/pokotype/releases").unwrap()
        ));
        for url in [
            "file:///etc/passwd",
            "javascript:alert(1)",
            "custom:launch",
            "http://localhost:8000",
            "https://user:password@example.com",
            "tauri://localhost/en/",
            "https://tauri.localhost/",
        ] {
            assert!(!is_external_url(&Url::parse(url).unwrap()), "{url}");
        }
    }
}
