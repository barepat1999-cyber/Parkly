import { ParkingProvider, Spot } from '../types';
import { createSpot } from './firestore';

/**
 * Mock provider for MVP - simulates municipal parking garage data
 * In production, replace with real HTTP fetch to external API
 */
class MockParkingProvider implements ParkingProvider {
  id = 'mock-municipal';
  name = 'Mock Municipal Parking';

  async fetchSpots(): Promise<Omit<Spot, 'id' | 'status' | 'confidence' | 'lastUpdated'>[]> {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Mock data for a few parking garages in Copenhagen
    return [
      {
        lat: 55.6761,
        lng: 12.5683,
        type: 'garage',
        source: 'provider',
        providerId: this.id,
        pricePerHour: 25,
        availableSpaces: 45,
      },
      {
        lat: 55.6819,
        lng: 12.5706,
        type: 'garage',
        source: 'provider',
        providerId: this.id,
        pricePerHour: 30,
        availableSpaces: 12,
      },
      {
        lat: 55.6712,
        lng: 12.5621,
        type: 'garage',
        source: 'provider',
        providerId: this.id,
        pricePerHour: 20,
        availableSpaces: 0,
      },
    ];
  }
}

/**
 * Provider registry - add new providers here
 */
const providers: ParkingProvider[] = [new MockParkingProvider()];

/**
 * Fetches spots from all registered providers and syncs to Firestore
 */
export async function syncProviderSpots(): Promise<void> {
  for (const provider of providers) {
    try {
      const spots = await provider.fetchSpots();
      
      for (const spotData of spots) {
        // Check if spot already exists (by providerId + lat/lng)
        // For MVP, we'll create new spots each time
        // In production, implement proper deduplication
        
        const now = new Date();
        const initialConfidence = spotData.availableSpaces && spotData.availableSpaces > 0 ? 0.8 : 0.2;
        
        await createSpot({
          ...spotData,
          status: spotData.availableSpaces && spotData.availableSpaces > 0 ? 'likely_free' : 'occupied',
          confidence: initialConfidence,
          lastUpdated: now,
        });
      }
    } catch (error) {
      console.error(`Error syncing provider ${provider.id}:`, error);
    }
  }
}

export { providers };
