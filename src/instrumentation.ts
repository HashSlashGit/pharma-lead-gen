export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const dns = await import('node:dns');
    // Network uses an IPv6 DNS server — include IPv6 Google/Cloudflare resolvers
    // so Node.js can reach a working DNS server regardless of address-family preference.
    dns.setServers([
      '8.8.8.8',
      '1.1.1.1',
      '[2001:4860:4860::8888]',
      '[2606:4700:4700::1111]',
    ]);
    dns.setDefaultResultOrder('ipv4first');
  }
}
