# openbird

## Running

```bash
npm run serve
```

The app will be available at `http://localhost:3000`.

## Accessing from other devices on your network

Find your local IP:

```bash
hostname -I | awk '{print $1}'
```

Then visit `http://<your-ip>:3000` from any device on the same network.

### Firewall

If the connection is refused, allow port 3000 through your firewall:

```bash
sudo ufw allow 3000
```
