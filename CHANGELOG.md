# [1.6.0](https://github.com/solsoftware-co/sol-notify/compare/v1.5.0...v1.6.0) (2026-10-04)


### Features

* log email sent after a successful delivery (SOL-46) ([1ca7851](https://github.com/solsoftware-co/sol-notify/commit/1ca7851645947bea295a90a6cef4d62e87f24ba4))

# [1.5.0](https://github.com/solsoftware-co/sol-notify/compare/v1.4.1...v1.5.0) (2026-10-03)


### Features

* log and forward trace and submission ids (SOL-46) ([d97fee2](https://github.com/solsoftware-co/sol-notify/commit/d97fee20bf9bed30f617d922f5c26ce6b1b368a0))

## [1.4.1](https://github.com/solsoftware-co/sol-notify/compare/v1.4.0...v1.4.1) (2026-10-02)


### Bug Fixes

* name the one-integration button after the service (SOL-44) ([71fe0df](https://github.com/solsoftware-co/sol-notify/commit/71fe0dff9c071a1f0dd52d7d6e1ebf6f7164243d))

# [1.4.0](https://github.com/solsoftware-co/sol-notify/compare/v1.3.0...v1.4.0) (2026-10-01)


### Features

* make sol-notify internal-only and ready for Sol Gate (SOL-37) ([d21c775](https://github.com/solsoftware-co/sol-notify/commit/d21c77563eee8f04473d734638d89596e297b962))
* send to valid recipients and drop invalid ones ([917bd88](https://github.com/solsoftware-co/sol-notify/commit/917bd88b53a7354a2910857f5d31dd41007a07b8))

# [1.3.0](https://github.com/solsoftware-co/sol-notify/compare/v1.2.0...v1.3.0) (2026-09-30)


### Features

* add form_submission email template with integration results (SOL-34) ([c96d8da](https://github.com/solsoftware-co/sol-notify/commit/c96d8da450bfaaa10b3eb8e99c380b5c79e027f9))

# [1.2.0](https://github.com/solsoftware-co/sol-notify/compare/v1.1.0...v1.2.0) (2026-09-26)


### Bug Fixes

* allow Worker-to-Worker fetch to sol-api on workers.dev ([613dc2b](https://github.com/solsoftware-co/sol-notify/commit/613dc2b1990b3a58c77525830f8c9fec6cebf4fe))
* **ci:** wait for a fully configured preview version before e2e ([fda784c](https://github.com/solsoftware-co/sol-notify/commit/fda784c4c75853ef7695f62dd8c502af5faca93b))
* don't retry email sends that fail with a non-retryable 4xx ([53972ac](https://github.com/solsoftware-co/sol-notify/commit/53972ac9f23f2855d9d9a21b6b82f296ee610184))


### Features

* add ephemeral per-PR preview env with Mailtrap e2e suite (SOL-17) ([0642237](https://github.com/solsoftware-co/sol-notify/commit/0642237303da513b510e88af85e8dfc630ffc4af))

# [1.1.0](https://github.com/solsoftware-co/sol-notify/compare/v1.0.0...v1.1.0) (2026-09-23)


### Features

* add persistent production environment (SOL-29) ([d7204e9](https://github.com/solsoftware-co/sol-notify/commit/d7204e953ddb9313ba5729473a5315c6a2459b43))

# 1.0.0 (2026-09-23)


### Bug Fixes

* match the old template's CTA button styling (black/lg/rounded) ([1e9a6cf](https://github.com/solsoftware-co/sol-notify/commit/1e9a6cfc97d79f01327c92502c1dde5d9fd781ce)), closes [#36363B](https://github.com/solsoftware-co/sol-notify/issues/36363B)
* pin semantic-release devDependency to avoid a Node engine mismatch ([2460d02](https://github.com/solsoftware-co/sol-notify/commit/2460d02b9e52d252d7faa41cd7733cf7fc578196))
* wire the banner through to the mailchimp_confirmation template ([2c0f258](https://github.com/solsoftware-co/sol-notify/commit/2c0f25868f9b9fb9f8814b8275b2d2140cae39d0))


### Features

* add Bruno collection (SOL-18) ([b0395ee](https://github.com/solsoftware-co/sol-notify/commit/b0395eead14ed77dab1cec3523511d71495e62b8))
* add persistent staging environment (SOL-16) ([f49ce40](https://github.com/solsoftware-co/sol-notify/commit/f49ce403ea6a6937f6d755ddde2d405522b70406))
* bootstrap sol-notify and the email-only notification.requested entrypoint ([edad883](https://github.com/solsoftware-co/sol-notify/commit/edad8832ee6c7551791d07509866d0c54b2196f9))
* serve the last rendered email as a real page for local preview ([975a406](https://github.com/solsoftware-co/sol-notify/commit/975a406c5d3a5a1b129925ea1f56fa7ef9053c5b))
* support an optional CTA button in mailchimp_confirmation ([17dd147](https://github.com/solsoftware-co/sol-notify/commit/17dd14703e928d4ba57783a3bb08ac726a309858))
