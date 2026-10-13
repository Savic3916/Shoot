# Sideline

Sideline is an Expo / React Native matchday app. It requests fixtures and scores directly from ESPN's public soccer scoreboard feeds, including UEFA Champions League and a curated set of other major competitions. There is no local data server, paid subscription, account, API token, or `.env` setup.

The scoreboard feed provides some teams' recent W/D/L form. Where at least four results per side are available, Sideline can show one form-based double-chance estimate per match and build at most one daily shortlist with a combined **model-implied** decimal price capped at 5.00.

**These are not bookmaker odds.** The public feed does not supply bookmaker prices, confirmed lineups, player availability, or complete team-history data. The displayed decimal is calculated as the inverse of an uncalibrated form estimate. It is not a verified probability, a betting tip, or a guarantee. The feed is unofficial and can change without notice; coverage is selected leagues, not every match worldwide.

## Run the app

1. Install dependencies with `npm install`.
2. Run `npm start` in the project directory.
3. Open `http://localhost:8082` (or the URL shown by Expo).

The app fetches the public scoreboard feeds directly from the browser or device. It does not need a separate server or a local provider configuration.

## Competition coverage

The feed checks the UEFA Champions League, Europa League and Conference League; major English, Spanish, German, Italian and French leagues and cups; selected European domestic leagues; and selected competitions in the Americas, Asia and Australia. ESPN does not provide one global soccer scoreboard endpoint, so the app checks the known league feeds individually. It shows every match returned by those feeds for the selected local date; it cannot promise every match worldwide or matches in competitions not listed in `src/features/football-data.ts`.

## Model limitations

The form estimate uses recent W/D/L outcomes, with a small smoothing prior. It does not use historical goal scores, head-to-head results, player statistics, lineup news, injuries, bookmaker prices, or trained/calibrated model weights. Matches without sufficient form do not receive a pick. Combined estimates multiply the selected leg estimates and assume independence, which is not assured.

No bet is safe or certain. This app is for informational and development purposes only, not betting advice.

## Data source

The app uses ESPN's publicly reachable soccer scoreboard JSON endpoints directly, for example:

- `https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/scoreboard?dates=YYYYMMDD`
- `https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard?dates=YYYYMMDD`

These endpoints are not a guaranteed public developer API. Sideline does not scrape Flashscore or copy protected site databases. Check the source provider's current terms before distributing or commercializing an app using its feed.

## References

- [ESPN UEFA Champions League scoreboard feed](https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/scoreboard)
- [ESPN English Premier League scoreboard feed](https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard)
- [Expo SDK 57 documentation](https://docs.expo.dev/versions/v57.0.0/)
- [Flashscore terms of use](https://www.flashscore.com/terms-of-use/)
