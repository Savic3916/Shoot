# Sideline

Sideline is an Expo / React Native football matchday app. It shows fixtures available in your provider subscription for today or tomorrow, recent completed scores, reported unavailable players, posted lineups, and current bookmaker odds when licensed access is available.

The app shows at most one eligible double-chance pick per fixture, including the decimal price and bookmaker, and builds **at most one** daily accumulator from eligible picks with a combined decimal price capped at 5.00. It requires at least four recent results per team, fresh available odds, and at least two different fixtures for an accumulator. It will show no pick rather than invent one when the data checks fail.

**No accumulator is safe or certain.** The price cap is not a probability. A multi-match accumulator loses if any leg loses, and adding legs increases the ways it can fail. The displayed probability is an unvalidated historical-rate estimate; it has not been back-tested or calibrated. It is for information only, not betting advice.

## Run the app

Install dependencies with `npm install`. Configure the live provider below, then start the data server with `npm run server` and the Expo app with `npx expo start`. Without a configured provider URL, the app displays a setup error instead of fictional fixtures.

## Connect Sportmonks

Sportmonks documents fixture-by-date requests, pre-match odds, lineups, player availability, and team-specific previous fixtures. Availability varies by subscription:

- League and fixture coverage is limited to your selected base plan. “All matches” means all fixtures the provider returns for your subscription, not every football match in the world.
- The provider's pre-match **Odds add-on is required** for prices. Confirm the selected plan includes the leagues, bookmakers, and markets you need before purchase.
- Injury/suspension (`sidelined`) and official lineup data are documented in the base plans. Official lineups are generally published near kick-off.
- Expected lineups need Sportmonks' separate Expected Lineups add-on. To request them, set `SPORTMONKS_EXPECTED_LINEUPS=true` after enabling that add-on in your account.

Setup:

1. Create a Sportmonks account and verify which plan covers your target leagues, odds, and request volume. Provider pages list base plans starting at €29/month and the pre-match odds add-on at €14–€69 depending on plan (checked October 2026); prices and entitlements can change.
2. Create an API token. Copy `.env.example` to `.env` and set `SPORTMONKS_API_TOKEN`.
3. Confirm your Sportmonks plan includes the competitions you need, including UEFA Champions League, and the Odds add-on covers your chosen bookmakers and markets. The API cannot return fixtures or odds outside your account entitlements.
4. Start the local data server: `npm run server`.
5. In another terminal start Expo: `npx expo start`.
6. On a physical device, set `EXPO_PUBLIC_API_URL` in `.env` to your computer's private LAN address, such as `http://192.168.1.20:4000`, and restart Expo. Do not commit `.env`.

The server keeps the provider token off-device and fetches all paginated fixtures returned for the selected local date, with scores, odds, sidelined reports, official lineups, and optional expected lineups. For up to 30 fixtures with double-chance odds, it requests each team's latest eight completed matches from the preceding 90 days, including player goals, assists, minutes, and ratings where the feed includes them. Responses are cached in memory for three minutes (fixture data) and 30 minutes (team form). A provider subscription's call limits apply.

The server is for local development only. It has permissive CORS and in-memory rate limiting. Do not expose it publicly without deployment-grade authentication, rate limiting, monitoring, HTTPS, and provider-key management.

## Shortlist method

The server normalizes provider data. The app groups double-chance prices by market/bookmaker, estimates fair implied chances from all three overlapping selections (home/draw, draw/away, and home/away), and averages those probabilities. Odds with missing timestamps or older than six hours are excluded from the accumulator. Each selection's baseline is blended with a smoothed rate from each team's most recent completed results. The shortlist uses a 70% bookmaker / 30% form blend, requires at least a 68% rough estimated chance, allows individual prices up to 1.90, and adds distinct matches in descending estimate order while the accumulator stays at or below 5.00. A minimum of two legs is required. It skips a fixture when a reported unavailable player has a tracked goal or assist in recent appearances.

This is an explainable prototype, **not a validated prediction model**. The combined chance display multiplies leg estimates and assumes independence; real match outcomes and markets are not guaranteed to be independent. The app does not yet quantify player-season statistics, assess the impact of absences, account for changing lineups/odds, or back-test against historical seasons. Absence and lineup information is shown as context only, not converted to a guessed adjustment. Validate calibration against held-out data before relying on any estimate.

## Why no Flashscore scraping?

Flashscore's terms restrict copying or extracting substantial database content without permission. Sideline uses a licensed feed instead; review your provider's current terms before commercial use.

## Research references

- [Sportmonks Football API](https://www.sportmonks.com/football-api/)
- [Sportmonks fixture-by-date endpoint](https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints/fixtures/get-fixtures-by-date.md)
- [Sportmonks pre-match odds (Odds add-on required)](https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/odds-and-predictions/pre-match-odds.md)
- [Sportmonks sideline availability](https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/includes/sidelined.md)
- [Sportmonks lineups](https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/lineups-and-formations.md)
- [Sportmonks team-specific fixture history](https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints/fixtures/get-fixtures-by-date-range-for-team.md)
- [Sportmonks pricing](https://www.sportmonks.com/football-api/plans-pricing/)
- [Flashscore terms of use](https://www.flashscore.com/terms-of-use/)
- [Expo SDK 57 documentation](https://docs.expo.dev/versions/v57.0.0/)
