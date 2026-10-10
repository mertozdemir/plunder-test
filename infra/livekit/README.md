# LiveKit on the VPS

Railway has no UDP, so voice and screen-share media run on a small VPS with self-hosted LiveKit.

We use LiveKit's official config generator rather than hand-written files: it produces a matching
`docker-compose.yaml`, `livekit.yaml`, Caddy (TLS, including TURN over TLS on 443 for strict
mobile networks), Redis, and an install script, and prints the API key and secret.

On any machine with Docker:

```bash
docker pull livekit/generate
docker run --rm -it -v "$PWD:/output" livekit/generate
```

Answers for Plunder: primary domain `livekit.<your-domain>`, TURN domain `turn.<your-domain>`,
latest version, Let's Encrypt, local Redis, "Startup Shell Script". Copy the generated folder to
the VPS and run `sudo ./init_script.sh`.

Firewall: 80/tcp, 443/tcp, 7881/tcp, 3478/udp, 50000-60000/udp.

The API key and secret it prints go into the Railway token service as `LIVEKIT_API_KEY` and
`LIVEKIT_API_SECRET`. Never commit them.
