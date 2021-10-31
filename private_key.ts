import asn1js from "https://esm.sh/asn1.js";
import { decode } from "https://deno.land/std@0.113.0/encoding/base64url.ts";

const { define, bignum } = asn1js;
export const Version = define("Version", function () {
  this.int();
});

export const AlgorithmIdentifier = define("AlgorithmIdentifer", function () {
  this.seq().obj(
    this.key("algorithm").objid(),
    this.key("parameters").optional().any(),
  );
});

export const PrivateKeyInfo = define("PrivateKeyInfo", function () {
  this.seq().obj(
    this.key("version").use(Version),
    this.key("privateKeyAlgorithm").use(AlgorithmIdentifier),
    this.key("privateKey").octstr(),
    this.key("attributes").optional().any(),
  );
});

export const RsaPrivateKey = define("RSAPrivateKey", function () {
  this.seq().obj(
    this.key("version").use(Version),
    this.key("modulus").int(),
    this.key("publicExponent").int(),
    this.key("privateExponent").int(),
    this.key("prime1").int(),
    this.key("prime2").int(),
    this.key("exponent1").int(),
    this.key("exponent2").int(),
    this.key("coefficient").int(),
  );
});

const toBigNum = (str: string) => new bignum(decode(str), 10, "be").iabs();

export async function loadPrivateKey(keyfile: string) {
  const privatekey = JSON.parse(await Deno.readTextFile(keyfile));
  const der = PrivateKeyInfo.encode(
    {
      version: 0,
      privateKeyAlgorithm: {
        algorithm: [1, 2, 840, 113549, 1, 1, 1],
        parameters: [5, 0],
      },
      privateKey: RsaPrivateKey.encode({
        version: 0,
        modulus: toBigNum(privatekey.n),
        publicExponent: toBigNum(privatekey.e),
        privateExponent: toBigNum(privatekey.d),
        prime1: toBigNum(privatekey.p),
        prime2: toBigNum(privatekey.q),
        exponent1: toBigNum(privatekey.dp),
        exponent2: toBigNum(privatekey.dq),
        coefficient: toBigNum(privatekey.qi),
      }, "der"),
    },
  );

  const cryptoKey: CryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSA-PSS", hash: "SHA-256" },
    false,
    ["sign"],
  );

  return { cryptoKey, jwk: privatekey };
}
