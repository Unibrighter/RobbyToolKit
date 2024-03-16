function FindProxyForURL(url, host) {
    // Proxy *.qq.com traffic through 127.0.0.1:8080
    if (dnsDomainIs(host, ".qq.com")) {
        return "PROXY 127.0.0.1:8080; DIRECT";
    }

    // All other traffic goes directly to the destination server
    return "DIRECT";
}
