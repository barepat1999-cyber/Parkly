# TODO - Næste Fase

## Høj Prioritet

1. **Rigtige Provider APIs**
   - Erstat `MockParkingProvider` med rigtige HTTP calls til kommunale/private API'er
   - Implementér error handling og retry logic
   - Tilføj rate limiting og caching

2. **Geo Queries**
   - Implementér GeoFirestore eller lignende for effektive radius queries
   - Erstat client-side filtering med server-side geo queries
   - Optimér performance for store datasæt

3. **Email Authentication**
   - Opgradér fra anonym auth til email/password login
   - Tilføj password reset flow
   - Implementér email verification

## Medium Prioritet

4. **Betalingsflow**
   - Integrér Stripe eller lignende for premium features
   - Implementér in-app betaling for p-hus adgang
   - Tilføj subscription management

5. **Push Notifikationer**
   - Setup Firebase Cloud Messaging
   - Notificér brugere når nye pladser er tilgængelige i nærheden
   - Tillad brugere at sætte præferencer for notifikationer

6. **Karma System Forbedringer**
   - Implementér bonus karma når andre bekræfter ens rapporter
   - Tilføj karma leaderboard
   - Belønninger baseret på karma niveau

## Lav Prioritet

7. **Private Spots Marketplace**
   - Tillad brugere at oprette og udleje private parkeringspladser
   - Implementér booking system
   - Tilføj betalingsflow for udlejning

8. **Offline Support**
   - Cache spots lokalt med AsyncStorage eller SQLite
   - Sync rapporter når online igen
   - Vis offline indicator i UI

9. **Analytics & Monitoring**
   - Tilføj Firebase Analytics for brugsmønstre
   - Implementér error tracking (Sentry)
   - Performance monitoring

10. **Deep Linking Forbedringer**
    - Forbedr navigation deep links til Apple/Google Maps
    - Tilføj deep links til specifikke spots
    - Share spots med andre brugere

11. **UI/UX Forbedringer**
    - Tilføj animations og transitions
    - Forbedr loading states
    - Tilføj dark mode support
    - Implementér accessibility features

12. **Testing**
    - Tilføj integration tests
    - E2E tests med Detox
    - Performance tests
