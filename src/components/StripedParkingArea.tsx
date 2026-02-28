import React from 'react';
import { Polygon } from 'react-native-maps';
import { ParkingArea } from '../types/parking';

interface StripedParkingAreaProps {
  area: ParkingArea;
}

export default function StripedParkingArea({ area }: StripedParkingAreaProps) {
  // Compute bounding box
  const lats = area.polygon.map((p) => p.latitude);
  const lngs = area.polygon.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const width = maxLng - minLng;
  const height = maxLat - minLat;
  const diagonal = Math.sqrt(width * width + height * height);

  // Generate diagonal stripes (limit to 12 for performance)
  const numStripes = Math.min(12, Math.max(6, Math.floor(diagonal * 5000)));
  const stripes: { latitude: number; longitude: number }[][] = [];

  // Stripe spacing
  const stripeSpacing = diagonal / numStripes;

  for (let i = 0; i < numStripes; i++) {
    const offset = i * stripeSpacing;
    const stripeWidth = stripeSpacing * 0.3; // Make stripes thinner

    // Create diagonal stripe from bottom-left to top-right
    // Each stripe is a parallelogram
    const stripe: { latitude: number; longitude: number }[] = [
      // Bottom-left
      {
        latitude: minLat + (height * offset) / diagonal - (height * stripeWidth) / diagonal,
        longitude: minLng + (width * offset) / diagonal - (width * stripeWidth) / diagonal,
      },
      // Bottom-right
      {
        latitude: minLat + (height * offset) / diagonal + (height * stripeWidth) / diagonal,
        longitude: minLng + (width * offset) / diagonal + (width * stripeWidth) / diagonal,
      },
      // Top-right
      {
        latitude: minLat + (height * (offset + stripeSpacing)) / diagonal + (height * stripeWidth) / diagonal,
        longitude: minLng + (width * (offset + stripeSpacing)) / diagonal + (width * stripeWidth) / diagonal,
      },
      // Top-left
      {
        latitude: minLat + (height * (offset + stripeSpacing)) / diagonal - (height * stripeWidth) / diagonal,
        longitude: minLng + (width * (offset + stripeSpacing)) / diagonal - (width * stripeWidth) / diagonal,
      },
    ];

    // Clip stripe to bounding box (simple check)
    const validStripe = stripe.filter((point) => {
      return (
        point.latitude >= minLat - 0.001 &&
        point.latitude <= maxLat + 0.001 &&
        point.longitude >= minLng - 0.001 &&
        point.longitude <= maxLng + 0.001
      );
    });

    if (validStripe.length >= 3) {
      stripes.push(validStripe);
    }
  }

  return (
    <>
      {/* Base polygon with semi-transparent fill */}
      <Polygon
        coordinates={area.polygon}
        fillColor="rgba(100, 150, 200, 0.2)"
        strokeColor="rgba(100, 150, 200, 0.5)"
        strokeWidth={1}
      />
      {/* Diagonal stripes */}
      {stripes.map((stripe, index) => (
        <Polygon
          key={`stripe-${area.id}-${index}`}
          coordinates={stripe}
          fillColor="rgba(255, 255, 255, 0.4)"
          strokeColor="rgba(255, 255, 255, 0.2)"
          strokeWidth={0.5}
        />
      ))}
    </>
  );
}
