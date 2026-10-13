# Sideline

Sideline is an Expo / React Native football match form app. It shows fixtures, recent form, and five historical-rate estimates per match:

- Home win or draw
- Away win or draw
- Home team to score 2+ goals
- Away team to score 2+ goals
- Over 2.5 total goals

Each estimated chance is displayed with its reciprocal as **decimal fair odds**. These are not bookmaker prices, guaranteed predictions, or betting advice. The included calculation is an explainable historical baseline, not a statistically validated or calibrated forecasting model.

## Run the app

Install dependencies with `npm install`, then start Expo with `npx expo start`. Without a configured data server the app opens in **demo mode**, which uses fictional teams and generated example scores clearly marked as sample data.

## Connect live fixtures and results

The app uses [football-data.org](https://www.football-data.org/) for match schedules and completed results. Its API supports competitions, match lists, date filters, and authentication with an API token. The selected competitions are Premier League (`PL`), La Liga (`PD`), Bundesliga (`BL1`), Serie A (`SA`), and Ligue 1 (`FL1`); actual access and history depth depend on the provider's current plan and competition coverage.

The provider token belongs on the server, not in an Expo `EXPO_PUBLIC_` variable or a mobile app bundle.

1. Register with [football-data.org](https://www.football-data.org/client/register) and obtain an API token.
2. Copy `.env.example` to `.env` and set `FOOTBALL_DATA_API_KEY` to the token.
3. For Expo web or a simulator on the same computer, keep `EXPO_PUBLIC_API_URL=http://localhost:4000`. For a physical phone, set it to the computer's private LAN address, for example `http://192.168.1.20:4000`. Keep the phone and computer on the same network.
4. Start the API server with `npm run server`.
5. In another terminal, start the app with `npx expo start`. Restart Expo after changing `.env`.

The server fetches fixtures for the selected date and up to 120 days of completed competition matches; responses are cached for three minutes. The provider may impose request limits or restrict competitions/history for your plan. The sample API server is for local development only: it has permissive CORS and in-memory rate limiting, and should not be deployed publicly without authentication, production-grade abuse controls, and HTTPS.

## Model

For a fixture, the model takes each team's latest eight completed matches before kick-off and up to five previous head-to-head meetings. It weights head-to-head observations at 0.65 and adds a Beta(2, 2) smoothing prior. The five market rates are calculated from the observed results/goals relevant to each market, then bounded to 4–96% before converting to fair odds. No future matches are included.

The app does not claim accuracy. Before relying on a model, evaluate it against held-out historical seasons, compare probability calibration and a proper scoring rule against simple baselines, and account for league, lineup, injury, and schedule information not included here.

## Why no scraping?

This app deliberately does not scrape score sites. Site terms, data permissions, page structure, and robots policies differ; scraping may be prohibited, fragile, and incomplete. Use a provider feed you are authorized to access and review its terms before commercial use.

## Research references

- [football-data.org API quickstart and endpoint reference](https://www.football-data.org/documentation/quickstart)
- [football-data.org competition coverage](https://www.football-data.org/coverage)
- [Expo SDK 57 documentation](https://docs.expo.dev/versions/v57.0.0/)
- [Expo Router documentation](https://docs.expo.dev/versions/v57.0.0/sdk/router/)
