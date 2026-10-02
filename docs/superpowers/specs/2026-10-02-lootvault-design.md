# LootVault — Design Spec

- **Ngày:** 2026-10-02
- **Trạng thái:** Đã duyệt design (v2 + tách 2 web app), chờ review spec
- **Mục đích:** Project cá nhân để phỏng vấn vòng 1 tại Game Locker (marketplace TCG đa cửa hàng). Vòng này yêu cầu show project, live thêm/sửa tính năng và giải thích cách giải quyết vấn đề.
- **Nguồn gốc:** Viết lại `nftify-api` (NFT store builder cũ) theo kiến trúc microservice sạch. Đồng thời sửa các lỗi kiến trúc đã biết của bản cũ; đó chính là "câu chuyện" để kể khi phỏng vấn.

---

## 1. Mục tiêu và tiêu chí thành công

| # | Tiêu chí | Cách kiểm chứng |
|---|---|---|
| G1 | Publisher tạo store, upload NFT (có supply và giá), publish. User vào trang store để xem và mua | Demo end-to-end trên local |
| G2 | Không oversell: 20 người mua tranh 5 bản cuối thì đúng 5 thành công, DB khớp với chain | `npm run demo:race` in ra assertion PASS |
| G3 | Toàn bộ chạy local bằng 3 lệnh: `docker compose up -d`, `npm run bootstrap`, `npm run dev` | Làm theo README trên máy sạch |
| G4 | Deploy được lên AWS free tier: Lambda, API Gateway, S3, DynamoDB, SNS/SQS, EventBridge, cùng Mongo Atlas M0 | `npm run deploy:aws` theo guide |
| G5 | Codebase dễ mở rộng để live-code trong 20–30 phút | Playbook có 5–6 tính năng chuẩn bị sẵn và chỉ rõ chỗ cần sửa |
| G6 | Có test chứng minh các bất biến quan trọng | Hardhat tests và Jest unit tests đều xanh |

## 2. Scope

**Trong scope (MVP):**
- Đăng nhập bằng ví theo chuẩn SIWE (EIP-4361).
- Mỗi ví sở hữu tối đa 1 store.
- Item là NFT ERC-1155 có supply. Lazy mint: publisher ký listing EIP-712, không tốn gas.
- Checkout có platform co-sign (EIP-712, gắn với người mua, có deadline).
- Mua trên chain. Indexer đọc event, publish qua SNS/SQS, các service cập nhật projection.
- Đổi giá và unpublish có hiệu lực ngay mà không tốn gas.
- Order có các trạng thái PENDING → PAID / EXPIRED. Sweeper chạy định kỳ để expire order.
- Dashboard doanh thu cho publisher. Storefront có "My collection" và "Recent sales".
- Hai web app riêng: **Studio** dành cho publisher, **Storefront** dành cho người mua.

**Ngoài scope** (để làm live feature hoặc nói trong playbook):
- Secondary market (resale), offers và bids, auction.
- Royalty EIP-2981, discount code, notification.
- Reservation cứng bằng DynamoDB atomic counter.
- Một ví có nhiều store, refresh token, CloudFront, CI/CD, full-text search.

## 3. Kiến trúc tổng quan

```
 Studio (Vite/React :5173)        Storefront (Vite/React :5174)
          │  local: Vite proxy /api/* | AWS: gọi thẳng API Gateway URL
          ▼
 ┌──────────────┬────────────────┬────────────────┐
 auth-svc :3001  catalog-svc :3002  order-svc :3003   indexer-svc :3004 (health only)
 /auth/*         /catalog/*         /orders/*         poll chain logs
 Mongo users     Mongo stores,items Mongo orders      DynamoDB cursors
 DDB nonces      S3 media/metadata  DDB activity      │
                 inbox (Mongo)      inbox (Mongo)     │ publish
        ▲               ▲ SQS catalog-events  ▲ SQS order-events
        │               └──────── SNS lootvault-domain-events ◄─┘
        │  order-svc ──(sync HTTP, x-internal-key)──► catalog-svc /catalog/internal/*
 Chain: Hardhat node :8545 (local) | Sepolia (AWS)
 Contract: LootVault1155 (ERC-1155 + EIP-712 lazy mint + checkout co-sign)
```

**Nguyên tắc kiến trúc** (mỗi nguyên tắc là một ADR trong playbook):
1. **Database per service.** Không service nào đọc DB của service khác.
2. **Chọn DB theo access pattern:**
   - **MongoDB** cho dữ liệu cần query linh hoạt: filter, sort, pagination, aggregation doanh thu.
   - **DynamoDB** cho truy cập theo key hoặc dạng append, có TTL: nonce, cursor, activity feed.
3. **Event cho projection, sync call cho command cần dữ liệu tươi.**
   - Checkout gọi catalog đồng bộ, vì cần giá và trạng thái hiện tại.
   - Số `sold`, holdings và trạng thái order cập nhật qua event.
4. **Chain là source of truth** cho quyền sở hữu và việc thanh toán. DB chỉ là projection, nhất quán theo kiểu eventual.
5. **Hexagonal adapters.** Cùng một handler domain chạy được qua hai đường:
   - HTTP: Nest app local, hoặc `serverless-express` trên Lambda.
   - Message: SQS poller local, hoặc Lambda SQS event source.
6. **Idempotency nằm cùng transaction với side effect (inbox pattern).** Consumer ghi `processed_events` (unique `_id = eventId`) và thay đổi state trong **cùng một Mongo transaction**. Activity trên DynamoDB idempotent tự nhiên nhờ key xác định.

## 4. Repo layout

```
lootvault/
├── package.json                 # npm workspaces + script gốc (dev, bootstrap, test, deploy)
├── docker-compose.yml           # mongo (replica set rs0), moto (S3/SNS/SQS/DynamoDB), hardhat-node
├── .env.example                 # 1 file env dùng chung cho local
├── contracts/                   # Hardhat + OpenZeppelin 5
│   ├── contracts/LootVault1155.sol
│   ├── test/LootVault1155.test.ts
│   └── scripts/deploy.ts        # ghi deployments/<network>.json
├── packages/shared/             # TS thuần, build ra CJS + d.ts
│   └── src/{eip712.ts, events.ts, abi/LootVault1155.json, constants.ts}
├── backend/                     # NestJS 11 monorepo (1 package.json)
│   ├── apps/{auth-svc,catalog-svc,order-svc,indexer-svc}/src/
│   │   ├── main.ts              # bootstrap HTTP local
│   │   ├── lambda.ts            # handler cho HTTP/SQS/schedule trên AWS
│   │   └── <feature modules>
│   ├── libs/common/             # config (zod), errors + filter, auth guard JWT, pagination, logger (pino), internal-key guard
│   ├── libs/aws/                # factory cho AWS SDK v3 client, override endpoint khi chạy local
│   ├── libs/messaging/          # EventEnvelope, SnsPublisher, SqsPoller (local), sqsHandler (Lambda)
│   ├── libs/inbox/              # InboxService.runOnce(eventId, session => ...)
│   ├── libs/chain/              # ethers provider, verify EIP-712, platform signer
│   └── scripts/build-lambda.mjs # esbuild + SWC (giữ decorator metadata), mỗi app ra 1 bundle
├── web/
│   ├── shared/                  # api client, WalletProvider (MetaMask + Demo wallet), useSiwe, UI components
│   ├── studio/                  # app cho publisher (:5173)
│   └── storefront/              # app cho người mua (:5174)
├── infra/template.yaml          # AWS SAM
├── scripts/
│   ├── bootstrap-local.ts       # tạo bucket/topic/queue/table trên moto, deploy contract, ghi .env, seed
│   ├── seed.ts                  # 2 store mẫu và các item kèm ảnh
│   └── race-demo.ts             # demo G2
└── docs/
    ├── INTERVIEW_PLAYBOOK.md    # tiếng Việt: pitch, demo script, ADR, bảng trước/sau, live features, Q&A
    ├── adr/                     # mỗi quyết định một file ngắn
    └── superpowers/specs|plans/
```

**Ngôn ngữ:** README và code comment viết tiếng Anh, để dùng làm portfolio công khai. Playbook viết tiếng Việt, để phục vụ việc chuẩn bị phỏng vấn.

## 5. Smart contract: `LootVault1155`

Kế thừa OpenZeppelin 5: `ERC1155`, `EIP712("LootVault", "1")`, `Ownable`, `ReentrancyGuard`.

**Các struct EIP-712:**
```solidity
struct Listing {            // publisher ký khi publish hoặc đổi giá
  address creator;
  bytes32 salt;             // sinh ngẫu nhiên khi tạo item
  uint256 supply;           // tổng số bản tối đa
  uint256 price;            // wei / bản
  string  uri;              // metadata URI (S3)
}
struct Checkout {           // platform ký ở bước checkout
  bytes32 listingHash;      // = _hashTypedDataV4(hashStruct(listing))
  address buyer;
  uint256 quantity;
  bytes32 orderId;          // từ order-svc, chống replay
  uint256 deadline;         // unix seconds, mặc định now + 5 phút
}
```

**State:**
- `platformSigner`, `treasury`, `feeBps` (mặc định 250 = 2.5%).
- `minted[tokenId]`, `creatorOf[tokenId]`, `_uris[tokenId]`, `usedOrders[orderId]`.

**`tokenId = uint256(keccak256(abi.encode(creator, salt)))`.** tokenId tính được off-chain trước khi mint, và một creator không thể chiếm tokenId của creator khác.

**`purchase(Listing l, bytes creatorSig, Checkout c, bytes platformSig) payable nonReentrant`** kiểm tra theo thứ tự và revert bằng custom error:
1. `recover(listingDigest, creatorSig) == l.creator`, ngược lại `InvalidCreatorSignature`.
2. `c.listingHash == listingDigest`, ngược lại `ListingMismatch`.
3. `recover(checkoutDigest, platformSig) == platformSigner`, ngược lại `InvalidPlatformSignature`.
4. `msg.sender == c.buyer`, ngược lại `WrongBuyer`. `block.timestamp <= c.deadline`, ngược lại `CheckoutExpired`.
5. `!usedOrders[c.orderId]`, ngược lại `OrderAlreadyUsed`. Sau đó đánh dấu đã dùng.
6. `minted[id] + c.quantity <= l.supply`, ngược lại `SoldOut`. **Đây là bất biến chống oversell.**
7. `msg.value == l.price * c.quantity`, ngược lại `WrongPayment`.
8. Nếu là lần mint đầu tiên: gán `creatorOf` và `_uris`. Sau đó `minted += qty`, `_mint(buyer, id, qty)`.
9. Chia tiền theo kiểu push: `fee` gửi cho treasury, phần còn lại gửi cho creator.
10. `emit Purchased(orderId, tokenId, creator, buyer, quantity, totalPaid, fee)`.

**Admin:** `setPlatformSigner`, `setTreasury`, `setFeeBps` (tối đa 1000).

**Event dùng cho indexer:** `Purchased`, `TransferSingle` (của ERC-1155, để cập nhật holdings).

**Đổi giá:** publisher ký lại một Listing cùng salt nhưng khác giá. Listing cũ không chết trên chain, nhưng platform không co-sign cho nó nữa, nên trên thực tế listing cũ chỉ còn tác dụng với những Checkout đã ký trong vòng ≤ 5 phút trước đó. Trade-off này được ghi rõ trong ADR.

## 6. Services

**Quy ước chung:**
- Response thành công trả JSON trực tiếp. Lỗi trả `{ error: { code, message, details? } }` thông qua global exception filter.
- Validate bằng `class-validator` và global `ValidationPipe` (bật whitelist).
- Mọi request có `x-request-id` và được log bằng pino.
- Swagger nằm ở `/<prefix>/docs`.
- Pagination dạng cursor: `?limit=&cursor=`, trả về `{ items, nextCursor }`.
- JWT HS256, `JWT_SECRET` dùng chung. Payload `{ sub: address }`, TTL lấy từ env (mặc định 2h, đủ cho buổi demo).

### 6.1 auth-svc (`/auth`)

| Method | Path | Mô tả |
|---|---|---|
| GET | `/auth/nonce?address=` | Tạo nonce, ghi DDB `Nonces` (PK `nonce`, `address`, TTL 5 phút) |
| POST | `/auth/verify` `{message, signature}` | Parse và verify SIWE (domain, chainId, chữ ký). Consume nonce bằng **DeleteItem có điều kiện** (chống replay). Upsert user. Trả `{accessToken, address}` |
| GET | `/auth/me` | Trả thông tin user |

Mongo `users`: `{ _id: address(lowercase), createdAt, lastLoginAt }`.

### 6.2 catalog-svc (`/catalog`)

**Mongo `stores`:**
- `{ _id, slug (unique), ownerAddress (unique), name, description, logoUrl, bannerUrl, accentColor, createdAt }`.

**Mongo `items`:**
- `{ _id, storeId, ownerAddress, name, description, imageUrl, attributes[], tokenId (string, unique), salt, metadataUri, supply, sold, priceWei (string), status: DRAFT|LIVE|HIDDEN, listing: { priceWei, supply, uri, hash, signature, version } | null, createdAt, updatedAt }`.
- Index: `{storeId, status, createdAt}`, `{storeId, status, priceWei}`.

**Mongo `holdings`:**
- `{ _id: address:tokenId, address, tokenId, itemId, balance }`.

**Mongo `processed_events`:** dùng cho inbox.

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| POST | `/catalog/uploads/presign` | JWT | Trả **presigned POST** S3, có `content-length-range` ≤ 5MB, chỉ nhận `image/png\|jpeg\|webp\|gif`. Kết quả `{url, fields, publicUrl}` |
| POST | `/catalog/stores` | JWT | Tạo store (mỗi ví 1 store, slug unique) |
| GET | `/catalog/stores` | — | Danh sách store |
| GET | `/catalog/stores/me` | JWT | Store của tôi (hoặc 404) |
| PATCH | `/catalog/stores/me` | JWT | Sửa thông tin store |
| GET | `/catalog/stores/:slug` | — | Chi tiết store |
| GET | `/catalog/stores/:slug/items` | — | Các item LIVE, `?sort=newest\|price_asc\|price_desc`, cursor pagination |
| POST | `/catalog/items` | JWT, owner | Tạo DRAFT. Sinh salt, tính tokenId, ghi metadata JSON lên S3 `metadata/{tokenId}.json`. Trả `{item, typedData}` để publisher ký |
| GET | `/catalog/items/:id` | — | Chi tiết item (public) |
| GET | `/catalog/me/items` | JWT | Mọi item của store tôi, đủ mọi status |
| POST | `/catalog/items/:id/listing` | JWT, owner | Body `{priceWei}`. Trả `typedData` Listing mới để ký (dùng cho đổi giá hoặc publish lại) |
| POST | `/catalog/items/:id/publish` | JWT, owner | Body `{priceWei, signature}`. Server **tự dựng lại typed data**, recover ra địa chỉ ký phải là owner, và `supply` không được nhỏ hơn `sold`. Item chuyển LIVE, lưu listing, `version++` |
| POST | `/catalog/items/:id/unpublish` | JWT, owner | Chuyển HIDDEN |
| GET | `/catalog/holdings/:address` | — | Holdings kèm thông tin item |
| GET | `/catalog/internal/items/:id` | `x-internal-key` | Dùng cho order-svc: status, listing, supply, sold, storeId, ownerAddress |

**Consumer (queue `catalog-events`):**
- `chain.Purchased`: chạy `$inc items.sold` trong inbox transaction, match item theo `tokenId`.
- `chain.TransferSingle`: trừ balance của `from` (bỏ qua nếu là 0x0) và cộng balance của `to`, trong inbox transaction.

### 6.3 order-svc (`/orders`)

**Mongo `orders`:**
- `{ _id, orderId (bytes32 hex, unique), buyer, itemId, storeId, sellerAddress, tokenId, quantity, unitPriceWei, totalWei, status: PENDING|PAID|EXPIRED, deadline, txHash?, paidAt?, listingVersion, createdAt }`.
- Index: `{buyer, createdAt}`, `{storeId, status, createdAt}`, `{status, deadline}`.

**DDB `Activity`:**
- PK `STORE#{storeId}` hoặc `ITEM#{itemId}`, SK `{paidAtISO}#{orderId}`.
- Mỗi purchase ghi 2 bản (fan-out on write). Key xác định nên ghi lại cũng an toàn (idempotent).

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| POST | `/orders/checkout` | JWT | Body `{itemId, quantity(1..10)}`. Gọi catalog internal, yêu cầu LIVE. **Soft stock check:** `supply - sold - Σ qty(PENDING chưa hết hạn) ≥ quantity`. Tạo PENDING, ký Checkout. Trả `{order, purchase: {contract, listing, creatorSig, checkout, platformSig, value}}` |
| GET | `/orders/:id` | JWT (buyer hoặc seller) | Client poll để xem trạng thái |
| GET | `/orders/me` | JWT | Đơn của tôi |
| GET | `/orders/store/me` | JWT | Các đơn của store tôi (bán) |
| GET | `/orders/store/me/stats` | JWT | `{revenueWei, ordersPaid, itemsSold, last7Days[]}` (Mongo aggregation) |
| GET | `/orders/activity?storeId=\|itemId=` | — | Recent sales lấy từ DDB |

**State machine** (mọi chuyển trạng thái là update có điều kiện theo status hiện tại):
- `PENDING → PAID` khi nhận event `Purchased`.
- `PENDING → EXPIRED` khi sweeper thấy `deadline + GRACE(120s) < now`.
- `EXPIRED → PAID` khi event đến muộn. Event là sự thật, vì contract đảm bảo tx chỉ thành công nếu được mine trước deadline.

**Consumer (queue `order-events`):** `chain.Purchased` chạy trong inbox transaction, chuyển order sang PAID kèm `txHash` và `paidAt`, sau đó ghi activity.

**Sweeper:** local dùng `@nestjs/schedule` mỗi 30s. AWS dùng EventBridge `rate(5 minutes)`.

### 6.4 indexer-svc

- **Cursor:** DDB `Cursors`, PK `"{chainId}:{contract}"`, giá trị `lastBlock`. Lần đầu bắt đầu từ `START_BLOCK`.
- **Mỗi tick:**
  1. Lấy `head`.
  2. Tính `to = min(head - CONFIRMATIONS, from + BATCH - 1)`.
  3. Gọi `getLogs(contract, [Purchased, TransferSingle])` và decode.
  4. Publish từng event lên SNS, theo đúng thứ tự block và logIndex.
  5. Cập nhật cursor **có điều kiện** `lastBlock = :prev`, để không bị 2 instance ghi đè nhau.
- Kết quả là giao event **ít nhất một lần**. Consumer xử lý trùng nhờ inbox.
- **Cấu hình:** `CONFIRMATIONS` bằng 0 ở local, 3 trên Sepolia. `BATCH` bằng 500 block.
- **Lịch chạy:** local là vòng lặp mỗi 2s. AWS là Lambda theo lịch 1 phút, mỗi lần chạy tối đa ~45s.

**Event envelope** (SNS message, raw delivery, message attribute `type` dùng cho filter policy):
```json
{ "id": "31337:0xTX:3", "type": "chain.Purchased", "chainId": 31337,
  "blockNumber": 120, "txHash": "0x..", "logIndex": 3, "occurredAt": "ISO",
  "data": { "orderId": "0x..", "tokenId": "123", "creator": "0x..", "buyer": "0x..",
            "quantity": "2", "totalPaid": "2000000000000000", "fee": "50000000000000" } }
```
`chain.TransferSingle.data = { operator, from, to, tokenId, value }`.

**Queue và filter:**

| Queue | Nhận event |
|---|---|
| `catalog-events` | `chain.Purchased`, `chain.TransferSingle` |
| `order-events` | `chain.Purchased` |

Mỗi queue có DLQ riêng (maxReceiveCount 5). Lambda bật `ReportBatchItemFailures`.

## 7. Web apps

Hai app dùng chung `web/shared`. Stack: Vite, React 18, TypeScript, React Router, TanStack Query, ethers v6, Tailwind v4.

- **WalletProvider** có 2 connector:
  - Injected (MetaMask).
  - **Demo wallet:** chọn một trong các tài khoản Hardhat có sẵn tiền, chỉ bật khi `VITE_CHAIN_ID=31337`. Nhờ vậy demo không phụ thuộc MetaMask.
- **useSiwe:** nonce, ký, verify, lưu JWT trong localStorage (theo từng app).
- **Studio (:5173):**
  - Connect và login.
  - Nếu chưa có store thì vào wizard tạo store (upload logo và banner).
  - Dashboard: các thẻ thống kê, chart 7 ngày, recent sales.
  - Items: bảng status, giá, `sold/supply`, các nút publish/unpublish/đổi giá.
  - New item: upload ảnh, form, tạo draft, ký listing, publish.
  - Settings: sửa store.
  - Link "View storefront".
- **Storefront (:5174):**
  - `/`: danh sách store.
  - `/s/:slug`: banner, lưới item kèm badge "còn N", sort.
  - `/s/:slug/items/:id`: ảnh, mô tả, giá, số còn lại, chọn số lượng, nút **Buy**. Luồng Buy: checkout, gửi tx, hiển thị trạng thái (Pending → Confirmed qua poll order), recent sales.
  - `/me`: My collection (holdings) và My orders.

## 8. Chạy local

- **`docker-compose.yml`:**
  - `mongo:7` chạy `--replSet rs0`, có healthcheck tự gọi `rs.initiate`, port 27017.
  - `motoserver/moto` cho S3, SNS, SQS, DynamoDB, port 4566.
  - `hardhat-node`: build từ `contracts/`, port 8545, chainId 31337.
- **Vì sao chọn moto:** LocalStack đã bắt buộc auth token kể từ 23/03/2026, còn moto mã nguồn mở và không cần tài khoản. Phương án dự phòng là `localstack/localstack:4.4` pinned.
- **`npm run bootstrap`:**
  - Deploy contract lên hardhat-node.
  - Tạo bucket (kèm CORS và public-read cho `media/` và `metadata/`), topic, queue, DLQ, subscription kèm filter policy, và table trên moto.
  - Ghi các giá trị sinh ra vào `.env.local`.
  - Chạy seed.
- **`npm run dev`:** dùng `concurrently` chạy 4 service (`nest start --watch`) và 2 web app (Vite).
- Vite proxy chuyển `/api/auth` → :3001, `/api/catalog` → :3002, `/api/orders` → :3003. Các service dùng prefix route trùng tên (`/auth`, ...), nên trên AWS chỉ cần đổi base URL.
- **Local và AWS khác nhau ở đâu:**
  - Ở local, SQS được đọc bằng `SqsPoller` (long-poll) chạy trong process của Nest app.
  - Ở local, sweeper và indexer chạy bằng `@nestjs/schedule` hoặc vòng lặp.
  - Handler domain dùng chung cho cả hai môi trường.

## 9. Deploy AWS (SAM, region `ap-southeast-1`)

| Resource | Cấu hình | Free tier |
|---|---|---|
| HTTP API | Route `/auth/{proxy+}`, `/catalog/{proxy+}`, `/orders/{proxy+}`, có CORS | 1M req/tháng (12 tháng) |
| Lambda | AuthApi, CatalogApi, OrderApi (serverless-express), CatalogEvents, OrderEvents (SQS), OrderSweeper (rate 5m), Indexer (rate 1m). Node 20, arm64, 512MB | Always free: 1M req và 400k GB-s |
| SNS + SQS | 1 topic, 2 queue + 2 DLQ, raw delivery, filter policy | Always free: 1M mỗi dịch vụ |
| DynamoDB | `Nonces` (TTL), `Cursors`, `Activity`. **Provisioned 2 RCU/2 WCU mỗi table** | Always free: 25 RCU/WCU, 25GB |
| S3 | `media` (public-read cho `media/*` và `metadata/*`, CORS), `studio-web`, `storefront-web` (static website) | 5GB (12 tháng) |
| EventBridge | 2 schedule rule | Free |
| MongoDB | Atlas **M0** trên AWS ap-southeast-1, IP allowlist `0.0.0.0/0` (Lambda ngoài VPC, không NAT) | Free mãi mãi |
| Chain | Sepolia qua RPC public hoặc Alchemy free. Deployer cần ~0.02 Sepolia ETH từ faucet | Free |

- **Secrets:** các tham số SAM `NoEcho` gồm MongoUri, JwtSecret, PlatformSignerKey, InternalApiKey. Playbook mô tả hướng production: Secrets Manager, và đặc biệt **KMS asymmetric key `ECC_SECG_P256K1`** để ký EIP-712 mà private key không bao giờ rời HSM. Đây là bước nâng cấp so với bản cũ (bản cũ dùng KMS chỉ để giải mã hot key).
- **Kết nối Mongo trong Lambda:** cache connection ở module scope, `maxPoolSize: 5`, `serverSelectionTimeoutMS: 5000`.
- **Build:** `backend/scripts/build-lambda.mjs` dùng esbuild + SWC (để giữ `emitDecoratorMetadata` mà Nest DI cần), ra một bundle cho mỗi app tại `dist/lambda/<svc>/index.js`. SAM dùng thư mục bundle sẵn qua `CodeUri`.
- **Lệnh:**
  - `npm run deploy:aws`: build bundle, `sam deploy --guided` (lần đầu), build 2 web app với `VITE_API_URL` lấy từ stack output, rồi `aws s3 sync`.
  - `npm run deploy:contract:sepolia`: deploy contract lên Sepolia.
- **Lưu ý free tier:** tài khoản AWS tạo sau 15/07/2025 dùng "Free plan" dạng credit trong 6 tháng. Lambda, DynamoDB, SNS, SQS vẫn có hạn mức always-free.

## 10. Testing

- **Contract (Hardhat):**
  - Mua thành công và chia tiền đúng.
  - Mua nhiều bản, sau đó SoldOut.
  - Các trường hợp revert: checkout hết hạn, dùng lại orderId, sai người mua, sai chữ ký creator, sai chữ ký platform, sai số tiền, listing không khớp.
  - Đổi giá (ký lại listing) vẫn giữ tokenId và counter.
- **Backend (Jest, `mongodb-memory-server` ở chế độ replica set):**
  - Verify EIP-712 khứ hồi bằng types dùng chung.
  - Bảng chuyển trạng thái của order state machine.
  - Inbox: cùng một event xử lý 2 lần thì chỉ có 1 hiệu ứng.
  - Nonce SIWE không dùng lại được.
- **Demo/E2E:** `npm run demo:race`.
  - Tạo item supply 5.
  - 20 ví checkout và purchase song song.
  - Chờ indexer xử lý.
  - Assert: on-chain minted = 5, orders PAID = 5, `item.sold` = 5, 15 tx revert `SoldOut`.

## 11. Tài liệu bàn giao

- **`README.md` (EN):** pitch, sơ đồ kiến trúc (mermaid), quickstart 3 lệnh, hướng dẫn deploy AWS, danh sách quyết định thiết kế.
- **`docs/INTERVIEW_PLAYBOOK.md` (VI):**
  - Pitch 2 phút.
  - Kịch bản demo 10 phút.
  - **Bảng trước/sau so với nftify-api**, mỗi dòng có link file:line ở bản cũ và bản mới:
    - Race condition ở settle.
    - Login không verify chữ ký.
    - Kafka groupId chứa `Date.now()`.
    - `setTimeout` auction.
    - Hash do client gửi.
    - Thiếu idempotency.
    - Test rỗng.
  - Các deep-dive Q&A: scale, reorg, cold start, consistency, bảo mật.
  - **Live features chuẩn bị sẵn**, mỗi feature có các bước, file cần sửa và test cần thêm:
    1. Reservation cứng bằng DynamoDB conditional counter.
    2. Royalty EIP-2981.
    3. Discount code theo store.
    4. Secondary listing (resale).
    5. Notification qua SNS cho publisher.
    6. Rate limit checkout.
- **`docs/adr/`:** khoảng 8 ADR ngắn tương ứng các nguyên tắc ở mục 3, kèm quyết định về moto và co-sign.

## 12. Rủi ro và phương án

| Rủi ro | Phương án |
|---|---|
| moto chưa hỗ trợ đủ SNS→SQS fan-out hoặc CORS cho S3 POST | Kiểm tra ngay ở task đầu. Nếu lỗi thì dùng `localstack/localstack:4.4` pinned |
| Bundle Nest bằng esbuild bị lỗi do decorator metadata hoặc optional deps | Dùng SWC plugin và đánh dấu external các optional module của Nest. Smoke test `node -e require(bundle)` |
| Cold start Lambda chạy Nest (~1–2s) | Chấp nhận cho demo. Playbook nêu các cách giảm: tăng memory, lazy import, SnapStart cho Node |
| Faucet Sepolia khó lấy ETH | Demo chính chạy local. AWS là "deployable", có guide và có thể quay video trước |
| Ba service (auth, catalog, order) dùng chung một cluster Atlas M0 | Mỗi service một database riêng trong cùng cluster, vẫn đảm bảo DB-per-service ở mức logic. Trong Nest, route tĩnh (`/orders/me`, `/orders/store/me`, `/orders/activity`) phải khai báo trước `/orders/:id` |
