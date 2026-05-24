## Fix: Update `INTERAC_PRIVATE_JWK` secret

The `interac-start` edge function is returning 500 with `INTERAC_PRIVATE_JWK is not valid JSON` because the secret currently contains a URL string (starts with `https://ap...`) instead of a JWK JSON object.

### Step 1 — Re-prompt for the secret

Call `secrets--update_secret` for `INTERAC_PRIVATE_JWK` so a fresh input form appears in the chat. Paste the exact one-line JSON below (must start with `{"kty":"RSA"` — **not** a URL):

```
{"kty":"RSA","n":"o18C3Kgle1k-x2zT8aN5W7aPmYkwapLm5W11hIK3s-O3qLxgjOjZYClef3mZadbjzgflviv8X_liuWPOf0dnYRA8tPEQu4J6nm50eKZ3TRzMZKAalBkawBXbbkPLVdh1Mrq0AIdm9eixZ8yM9SM1Kk-MpAWvM3kTWzaG1PVegBjOPGQ5cERYQJDazslHeWfAMztzoGumTc6hRwkloJu6n12oNFUzGOzTwYVk8E7hTv-jd8rxZbH-LJQcQa1L6a5ZhdC4cMqw4ARhqoP0HGfQGQta7GKWjpmgO4Xu_xA9t2aQOS7NH6DtFymYcC1Z5yO6RNZ_X2r9RiEhnaBHVuPIFw","e":"AQAB","d":"L4IHoQc8rxwKx498Kr6xIdx68dkVPUiu4HTuQbSJm0RTOjxdj1x_Khmdo1BHLqIQ6O8e_ihoYbhx3xuJBzZKd81y-eNITF7rLXtNX3B5LPF89p4gXITYZJd2kiAg1zv1COWGRskZRdV_EYJIU1kDsuQjL-d_RWamHFZE61TXQER_WBG_crb7EPh43dmSxW5EpSHZ7gZ1PqVcbd44JVmf7kesRc5-c9emWagfE37wl9WbA-Z89KIOdzt2SAjOwZxJf91Sq2u4oGVVaVWYD0y06xuFux2qX873r-s1XXJkLkL_L3D7Ymbj2sunSccaBth0LbRUoE890TmF2XZI6MPdEQ","p":"1WZvf3qJTc93n_Mjwc2SSHaMeHCiJe4xcuLVY-21vFWRoLmWP3-hkBMmcqj5eVa1n0RRePhJYlmD3mnh9dzyNu23SkRNob6auxr4ht7AVHHZRHPRIzb_9nIZ9TVSTsuQJ-LqKQbVhL06F1pXhDmPEklmEpKViEtCcmeY8osiRHU","q":"w_vm7JFo3NM3kCaz1UKB-BuXmBT_RNM1HgOPC4D1c1eHz4ajD9RsXCNPOGcB9gzkZnROqZNvtpeH4SoKl-sBPqqZOMFl36hpYnK0YK7GIirGuPiQFldk6Ax-F7UPElkOZwPDKm6SbDlhoI1hgqNPyVjKGN05NNG4ky1gTed_WNs","dp":"JiLoSh_b6cvp1OveuAPE4K5O7Dc0wxKOQ7nF6NXSZJXmMJL6Bt8IQHcrp9IKw2R7kLrk1HmKo8jbiCPj_cw-fRJ-bwdF2GH3xPhM8c1dEbpG2bTY6zIpDCHYAbpFu08ls_sZXbua7N3kQ8ghW7_tkZcMZsVLc8__T_KzoqS6uwE","dq":"kFbXBUY2r-RTmLQYYClCZYOUy2ozcvIGvdsrH_LTUyaVHI9xSrhNMjLDJqwesqNeF-LzCEtQzG6foYKAGND4srmcbUNqjyWOr_YAyPAPdpyAjTxrijjFVW3V9AniVsYGKHKJ65dR-ajtMPzPYxJ6MbVV6qgLeM44nRSfR-EGVl8","qi":"XL8pX-3j_bMDgSMY8X6KsTQSZfkwL_hRfpq2IEM5dXECsavTSb6cficaS2BHfbSE5zDxtohDEJPg2PVJ40PXV54pPpvjgv7tpQLeoGMAxpZqYtsGTMDYqzFjbbKE2Hfhvoim_oC3A8Wx3BNTyRCU-dx-f00QRZjeYfW0P_Tjnvs","alg":"PS256","kid":"0f762484-76e3-4dd9-9c2b-6464b6dc6368","use":"sig"}
```

### Step 2 — Verify

After save, poll `https://hgmskcvaeadnyovbroup.supabase.co/functions/v1/interac-jwks` until it returns `{"keys":[...]}` and overwrite `public/oidc/jwks` with the fresh response.

### Step 3 — Test the flow

Retry "Verify with Interac" on `/onboarding/identity` — `interac-start` should now return an `authorization_url` (no more 500).

### Note about the public JWKS

In the Interac portal, register this public key block (or just point JWKS URL to `https://efin.money/oidc/jwks`):

```json
{"keys":[{"kty":"RSA","n":"o18C3Kgle1k-x2zT8aN5W7aPmYkwapLm5W11hIK3s-O3qLxgjOjZYClef3mZadbjzgflviv8X_liuWPOf0dnYRA8tPEQu4J6nm50eKZ3TRzMZKAalBkawBXbbkPLVdh1Mrq0AIdm9eixZ8yM9SM1Kk-MpAWvM3kTWzaG1PVegBjOPGQ5cERYQJDazslHeWfAMztzoGumTc6hRwkloJu6n12oNFUzGOzTwYVk8E7hTv-jd8rxZbH-LJQcQa1L6a5ZhdC4cMqw4ARhqoP0HGfQGQta7GKWjpmgO4Xu_xA9t2aQOS7NH6DtFymYcC1Z5yO6RNZ_X2r9RiEhnaBHVuPIFw","e":"AQAB","alg":"PS256","kid":"0f762484-76e3-4dd9-9c2b-6464b6dc6368","use":"sig"}]}
```