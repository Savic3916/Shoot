# Sideline

Sideline is an Expo / React Native matchday app. It loads fixtures and scores from a free public ESPN soccer scoreboard feed, including UEFA Champions League and a curated set of other major competitions. It needs no paid subscription, account, API token, or `.env` file to run on web.

The scoreboard feed provides some teams' recent W/D/L form. Where at least four results per side are available, Sideline can show one form-based double-chance estimate per match and build at most one daily shortlist with a combined **model-implied** decimal price capped at 5.00.

**These are not bookmaker odds.** The public feed does not supply bookmaker prices, confirmed lineups, player availability, or complete team-history data. The displayed decimal is calculated as the inverse of an uncalibrated form estimate. It is not a verified probability, a betting tip, or a guarantee. The feed is unofficial and can change without notice; coverage is selected leagues, not every match worldwide.

## Run the app

1. Install dependencies with `npm install`.
2. Run `npm start` in the project directory.
3. Open the web URL shown by Expo (usually `http://localhost:8081`).

The start command launches both the local data server and Expo. There is no paid provider or credential setup.

For a physical phone, set `EXPO_PUBLIC_API_URL` in a local `.env` to your computer's LAN address, for example `http://192.168.1.20:4000`, and restart Expo. The phone and computer must be on the same network.

The data server can also be run by itself using `npm run server`; its `/health` endpoint reports the active free feed. It requests scoreboards for the selected competitions in `server/index.mjs` concurrently and caches each date for two minutes.

## Competition coverage

The feed checks the UEFA Champions League, Europa League and Conference League; major English, Spanish, German, Italian and French leagues and cups; selected European domestic leagues; and selected competitions in the Americas, Asia and Australia. Coverage depends on what the public feed returns for a competition and date. A missing fixture can mean that competition/date is not covered by the feed; Sideline cannot guarantee a complete worldwide fixture list.

## Model limitations

The form estimate uses recent W/D/L outcomes, with a small smoothing prior. It does not use historical goal scores, head-to-head results, player statistics, lineup news, injuries, bookmaker prices, or trained/calibrated model weights. Matches without sufficient form do not receive a pick. Combined estimates multiply the selected leg estimates and assume independence, which is not assured.

No bet is safe or certain. This app is for informational and development purposes only, not betting advice.

## Data source

The development server uses ESPN's publicly reachable soccer scoreboard JSON endpoints, for example:

- `https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/scoreboard?dates=YYYYMMDD`
- `https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard?dates=YYYYMMDD`

These endpoints are not a guaranteed public developer API. Sideline does not scrape Flashscore or copy protected site databases. Check the source provider's current terms before distributing or commercializing an app using its feed.

## References

- [ESPN UEFA Champions League scoreboard feed](https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/scoreboard)
- [ESPN English Premier League scoreboard feed](https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard)
- [Expo SDK 57 documentation](https://docs.expo.dev/versions/v57.0.0/)
- [Flashscore terms of use](https://www.flashscore.com/terms-of-use/)
