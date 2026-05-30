# Pterodactyl Gateway SDK

![Pterodactyl Gateway Logo](https://raw.githubusercontent.com/akaanakbaik/pterodactyl-gateway/main/logo.png)

SDK TypeScript berfitur lengkap untuk Pterodactyl Panel. Fokus pada kemudahan integrasi bagi developer untuk membangun dashboard, bot, dan sistem otomasi panel yang kompleks.

## Fitur Utama

- **Full TypeScript**: Mendukung TypeScript secara penuh dengan definisi tipe yang komprehensif untuk semua respons API Pterodactyl.
- **Modular API**: Akses terstruktur ke Application API (Admin) dan Client API (User).
- **Smart Layer**: Abstraksi tingkat tinggi untuk operasi kompleks seperti pembuatan server dan manajemen user.
- **WebSocket Support**: Integrasi WebSocket untuk koneksi real-time ke konsol server dan statistik.
- **Developer Experience (DX)**: Desain API yang intuitif dan mudah digunakan dengan penanganan error yang informatif.

## Instalasi

```bash
npm install @akaanakbaik/pterodactyl-gateway
# atau
yarn add @akaanakbaik/pterodactyl-gateway
```

## Penggunaan SDK

### Inisialisasi

Anda dapat menginisialisasi `PteroGateway` dengan konfigurasi manual atau dari environment variables.

```typescript
import { createPtero } from '@akaanakbaik/pterodactyl-gateway';

// Dari konfigurasi manual
const ptero = createPtero({
  domain: 'https://panel.example.com',
  applicationKey: 'ptla_YOUR_APPLICATION_KEY',
  clientKey: 'ptlc_YOUR_CLIENT_KEY',
});

// Dari environment variables (PTERO_DOMAIN, PTERO_APPLICATION_KEY, PTERO_CLIENT_KEY)
const pteroFromEnv = createPtero.fromEnv();
```

### Application API (Admin)

#### Mengelola User

```typescript
// Membuat user baru
const newUser = await ptero.application.users.create({
  username: 'newuser',
  email: 'newuser@example.com',
  first_name: 'New',
  last_name: 'User',
  password: 'StrongPassword123',
  root_admin: false,
});
console.log('User baru:', newUser);

// Mendapatkan daftar user
const users = await ptero.application.users.list();
console.log('Daftar user:', users.data);

// Mendapatkan detail user
const userDetail = await ptero.application.users.get(1);
console.log('Detail user:', userDetail);
```

#### Mengelola Server

```typescript
// Mendapatkan daftar server
const servers = await ptero.application.servers.list();
console.log('Daftar server:', servers.data);

// Menangguhkan server
await ptero.application.servers.suspend(123);
console.log('Server 123 ditangguhkan.');
```

### Client API (User)

#### Mengakses Server Spesifik

```typescript
const server = ptero.server('your-server-identifier');

// Mendapatkan resource server
const resources = await server.resources();
console.log('Resource server:', resources);

// Mengirim command ke konsol server
await server.command('say Hello World!');
console.log('Command dikirim.');

// Mengontrol daya server
await server.power('restart');
console.log('Server di-restart.');
```

#### Manajemen File

```typescript
// Listing file di direktori root
const files = await server.files.list('/');
console.log('Files di root:', files.data);

// Membaca konten file
const fileContent = await server.files.read('/server.properties');
console.log('Konten server.properties:', fileContent);

// Menulis konten ke file
await server.files.write('/newfile.txt', 'Ini adalah konten baru.');
console.log('newfile.txt dibuat.');
```

### Smart Layer

#### Membuat Server dengan Smart Layer

```typescript
const newSmartServer = await ptero.smart.servers.create({
  name: 'My New Game Server',
  description: 'Server game otomatis',
  nodeId: 1, // ID Node Pterodactyl
  nestId: 5, // ID Nest (misal: Minecraft)
  eggId: 15, // ID Egg (misal: Paper)
  email: 'owner@example.com', // Email user, akan dibuat jika belum ada
  username: 'gameserver_owner',
  specs: {
    memory: '4GB',
    disk: '20GB',
    cpu: '100%',
    databases: 1,
    allocations: 1,
    backups: 0,
  },
  autoCreateUser: true,
});
console.log('Server pintar baru:', newSmartServer);
```

### WebSocket

```typescript
import { createPtero, PteroWebSocket } from '@akaanakbaik/pterodactyl-gateway';

const ptero = createPtero.fromEnv();
const serverId = 'your-server-identifier';
const ws = ptero.server(serverId).websocket.create();

ws.on('open', () => {
  console.log('WebSocket terhubung.');
  ws.send('auth', [token]);
  ws.send('send command', ['say Hello from WebSocket!']);
});

ws.on('console output', (data: string) => {
  console.log('Output konsol:', data);
});

ws.on('stats', (data: any) => {
  console.log('Statistik server:', data);
});

ws.on('close', () => {
  console.log('WebSocket terputus.');
});

ws.on('error', (err: any) => {
  console.error('WebSocket error:', err);
});

ws.connect();

// Untuk memutuskan koneksi setelah beberapa waktu
// setTimeout(() => {
//   ws.close();
// }, 60000);
```

## Kontribusi

Kami menyambut kontribusi! Silakan baca `CONTRIBUTING.md` untuk detail lebih lanjut.

## Lisensi

Proyek ini dilisensikan di bawah [MIT License](LICENSE).
