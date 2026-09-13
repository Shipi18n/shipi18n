/**
 * Shared hardening for the XML-based adapters (Android strings.xml, XLIFF).
 *
 * We keep `processEntities: true` because locale files legitimately use predefined
 * and numeric entities (&amp;, &#160;, &lt;) and the check needs the DECODED text
 * (parsing with it off leaves "&amp;" literal and corrupts every comparison).
 *
 * But fast-xml-parser relaxed its entity-expansion defaults in 5.5.10
 * (maxTotalExpansions became Infinity), leaving only a 100 KB byte cap between us
 * and a billion-laughs payload. So we pin conservative limits explicitly — a
 * locale file never needs chained entity expansion — so a future dependency bump
 * can't loosen them under us. Verified effective on fast-xml-parser 5.11.1.
 * External entities are already refused by the library (no XXE).
 */
export const XML_ENTITY_LIMITS = {
  maxEntitySize: 10_000,
  maxExpansionDepth: 20,
  maxTotalExpansions: 1_000,
  maxExpandedLength: 100_000,
  maxEntityCount: 100,
}
