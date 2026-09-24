# Native source provenance

Expo reference: commit `167ec74a43d77e1b61f751440334f9e645f8d2be`, expo-sqlite 55.0.20.

The repository stores official Git submodules and exact commits in `third-party/versions.json`. Maintainer/CI builds export those commits to temporary directories, generate source and compile libraries. No generated amalgamations, static archives, license inventories or HARs are committed. The published npm package includes those artifacts under `harmony/generated` and the default `harmony/library.har`.

| Submodule | Version | Upstream commit |
| --- | --- | --- |
| [SQLite](https://github.com/sqlite/sqlite) | 3.50.3 | `a4643b451a2941f5e6965ab095d3057bc7cb2222` |
| [SQLCipher](https://github.com/sqlcipher/sqlcipher) | 4.7.0 | `57d38556213b56fbdc2661fd65fd338efdf28ac9` |
| [sqlite-vec](https://github.com/asg017/sqlite-vec) | 0.1.7-alpha.2 | `bdc336d1cf2a2222b6227784bd30c6631603279b` |
| [libSQL](https://github.com/tursodatabase/libsql) | 0.9.5 | `81459627f117143aed29ae797c6d1355e4c4b694` |
| [OpenSSL](https://github.com/openssl/openssl) | 3.3.2 | `fb7fab9fa6f4869eaa8fbb97e0d593159f03ffe4` |

- `generated/vendor/sqlite3.{c,h}` and `sqlcipher/sqlite3.{c,h}` use upstream `configure` / `make sqlite3.c`, followed by Expo's API/struct prefix selection from `scripts/replace_symbols.ts`. The results match Expo byte for byte, including `exsqlite3_*`. Expo's MIT license is retained in `scripts/EXPO-LICENSE` and the generated license directory.
- `generated/vendor/libsql/libsql.h` is the official C header. `patches/libsql-ohos.patch` only extends upstream iOS/Android no-encryption target conditions to OHOS. SQL, replication, networking and TLS remain upstream implementations. Rust 1.85.1 builds both official OHOS targets with upstream Cargo.lock. No patch is applied inside the submodule.
- `generated/vendor/sqlite-vec/sqlite-vec.c` is unchanged upstream source. Its header uses the upstream template with fixed version, commit and commit timestamp; only build metadata differs from release archives. Unprefixed SQLite 3.50.3 headers provide the standard extension ABI. The platform `sys/types.h` is included by a compiler option for BSD integer typedefs, without editing sqlite-vec.
- `generated/prebuilt/{arm64-v8a,x86_64}` contains official libSQL C staticlibs and OpenSSL 3.3.2 libcrypto archives/headers. SQLCipher itself is compiled from generated source with application build flags.
- `generated/licenses` includes SQLite's public domain dedication, SQLCipher BSD, sqlite-vec MIT/Apache-2.0, libSQL MIT, OpenSSL Apache-2.0 and Expo MIT notices. The libSQL normal/build dependency inventory for both OHOS targets is generated from Cargo metadata, with exact versions, repositories and upstream license texts. Workspace crates inherit the libSQL root license; prost 0.12.6 shares the license shipped by the same-version prost-derive crate.

`harmony/generated/manifest.json` records source commits, recipe inputs, SDK/minimum API, Rust toolchain and every generated file's SHA-256. Preparation and prepack verify these checksums. Consumers use the published artifacts directly, without submodule initialization, Python or Rust.
