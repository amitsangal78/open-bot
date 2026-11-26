import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import ipaddr from "ipaddr.js";
import { load } from "cheerio";
import { AppError } from "./core";

export function publicAddress(address: string) {
  if (!ipaddr.isValid(address)) return false;
  let parsed = ipaddr.parse(address);
  if (parsed.kind() === "ipv6" && (parsed as ipaddr.IPv6).isIPv4MappedAddress())
    parsed = (parsed as ipaddr.IPv6).toIPv4Address();
  return parsed.range() === "unicast";
}
export async function publicPage(
  input: string,
  redirects = 0,
): Promise<{ url: string; body: string; type: string }> {
  const url = new URL(input);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !["80", "443"].includes(url.port)) ||
    redirects > 4
  )
    throw new AppError(
      "Only public HTTP/HTTPS pages on standard ports are supported.",
    );
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw new AppError("Private and local network URLs are blocked.");
  const address = addresses[0];
  const response = await new Promise<{
    status: number;
    location?: string;
    body: string;
    type: string;
  }>((resolve, reject) => {
    const req = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      url,
      {
        method: "GET",
        family: address.family,
        lookup: (_hostname, _options, callback) =>
          callback(null, address.address, address.family),
        headers: {
          "User-Agent": "PersonalAgent/1.0 (article reader)",
          Accept: "text/html,text/plain,application/json",
          "Accept-Encoding": "identity",
        },
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
          res.resume();
          resolve({
            status: res.statusCode,
            location: res.headers.location,
            body: "",
            type: "",
          });
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk) => {
          size += chunk.length;
          if (size > 1_000_000) {
            req.destroy(new AppError("Page exceeds the 1 MB reading limit."));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () =>
          resolve({
            status: res.statusCode || 500,
            body: Buffer.concat(chunks).toString("utf8"),
            type: res.headers["content-type"] || "",
          }),
        );
        res.on("error", reject);
      },
    );
    req.setTimeout(10000, () =>
      req.destroy(new AppError("Page request timed out.")),
    );
    req.on("error", reject);
    req.end();
  });
  if (response.location)
    return publicPage(new URL(response.location, url).href, redirects + 1);
  if (response.status >= 400)
    throw new AppError(`Page returned HTTP ${response.status}.`);
  if (
    !/text\/(html|plain|xml)|application\/(json|rss\+xml|xml)/i.test(
      response.type,
    )
  )
    throw new AppError("Only HTML, text, XML and JSON pages can be read.");
  return { url: url.href, body: response.body, type: response.type };
}
export async function readPage(url: string) {
  const page = await publicPage(url);
  if (!page.type.includes("html"))
    return { url: page.url, text: page.body.slice(0, 18000) };
  const $ = load(page.body);
  $("script,style,nav,footer,header,form,iframe,noscript").remove();
  return {
    url: page.url,
    title: $("title").text(),
    text: ($("article").text() || $("main").text() || $("body").text())
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 18000),
  };
}
export async function searchWeb(query: string) {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (key) {
    const response = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`,
      {
        headers: { "X-Subscription-Token": key },
        signal: AbortSignal.timeout(12000),
      },
    );
    if (!response.ok)
      throw new AppError(
        "Search provider unavailable. Try a direct article URL.",
      );
    const data = await response.json();
    return (data.web?.results || []).map(
      (r: { title: string; url: string; description: string }) => ({
        title: r.title,
        url: r.url,
        snippet: r.description,
      }),
    );
  }
  const results: { title: string; url: string; snippet: string }[] = [];
  try {
    const page = await publicPage(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    );
    const $ = load(page.body);
    $(".result").each((_i, element) => {
      const a = $(element).find("a.result__a"),
        href = a.attr("href");
      if (!href) return;
      const target = new URL(href, "https://duckduckgo.com");
      const url = target.searchParams.get("uddg") || target.href;
      if (/^https?:\/\//.test(url))
        results.push({
          title: a.text(),
          url,
          snippet: $(element).find(".result__snippet").text(),
        });
    });
  } catch {
    /* Try the independent public feed before reporting failure. */
  }
  if (!results.length) {
    try {
      const page = await publicPage(
        `https://www.bing.com/search?q=${encodeURIComponent(query)}&format=rss`,
      );
      const $ = load(page.body, { xmlMode: true });
      $("item").each((_i, item) => {
        const url = $(item).find("link").text();
        if (/^https?:\/\//.test(url))
          results.push({
            title: $(item).find("title").text(),
            url,
            snippet: $(item).find("description").text(),
          });
      });
    } catch {
      /* Both public sources may be unavailable or rate limited. */
    }
  }
  if (!results.length)
    throw new AppError(
      "Free search is temporarily unavailable. Paste a direct URL, or configure BRAVE_SEARCH_API_KEY for reliable search.",
    );
  return results.slice(0, 5);
}
