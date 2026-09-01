import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const userAuthUrl = new URL("../src/UserAuthSystem.js", import.meta.url);
const mojibakeMarkers = ["Ã", "Ä", "Å", "â€", "ï»¿", "\uFFFD"];

test("UserAuthSystem keeps Turkish messages in valid UTF-8", async () => {
  const source = await readFile(userAuthUrl, "utf8");

  for (const marker of mojibakeMarkers) {
    assert.equal(
      source.includes(marker),
      false,
      `Unexpected mojibake marker ${JSON.stringify(marker)} in UserAuthSystem.js`
    );
  }

  assert.match(source, /Kullanıcı adı en az 3 karakter olmalı\./u);
  assert.match(source, /Şifre en az 4 karakter olmalı\./u);
  assert.match(source, /Sunucu cevabı okunamadı\./u);
});
