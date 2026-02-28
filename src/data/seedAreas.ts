import { ParkingArea } from '../types/parking';

export const SEED_AREAS: ParkingArea[] = [
  // Nørreport area
  {
    id: 'area1',
    name: 'Nørreport Parking',
    polygon: [
      { latitude: 55.6770, longitude: 12.5675 },
      { latitude: 55.6775, longitude: 12.5685 },
      { latitude: 55.6765, longitude: 12.5695 },
      { latitude: 55.6760, longitude: 12.5685 },
    ],
  },
  // Kongens Nytorv area
  {
    id: 'area2',
    name: 'Kongens Nytorv Parking',
    polygon: [
      { latitude: 55.6740, longitude: 12.5695 },
      { latitude: 55.6745, longitude: 12.5705 },
      { latitude: 55.6735, longitude: 12.5715 },
      { latitude: 55.6730, longitude: 12.5705 },
    ],
  },
  // Nyhavn area
  {
    id: 'area3',
    name: 'Nyhavn Parking',
    polygon: [
      { latitude: 55.6815, longitude: 12.5760 },
      { latitude: 55.6820, longitude: 12.5770 },
      { latitude: 55.6810, longitude: 12.5780 },
      { latitude: 55.6805, longitude: 12.5770 },
    ],
  },
  // Vesterbro area
  {
    id: 'area4',
    name: 'Vesterbro Parking',
    polygon: [
      { latitude: 55.6695, longitude: 12.5615 },
      { latitude: 55.6700, longitude: 12.5625 },
      { latitude: 55.6690, longitude: 12.5635 },
      { latitude: 55.6685, longitude: 12.5625 },
    ],
  },
  // Islands Brygge area
  {
    id: 'area5',
    name: 'Islands Brygge Parking',
    polygon: [
      { latitude: 55.6645, longitude: 12.5795 },
      { latitude: 55.6650, longitude: 12.5805 },
      { latitude: 55.6640, longitude: 12.5815 },
      { latitude: 55.6635, longitude: 12.5805 },
    ],
  },
  // Østerbro area
  {
    id: 'area6',
    name: 'Østerbro Parking',
    polygon: [
      { latitude: 55.6825, longitude: 12.5730 },
      { latitude: 55.6830, longitude: 12.5740 },
      { latitude: 55.6820, longitude: 12.5750 },
      { latitude: 55.6815, longitude: 12.5740 },
    ],
  },
  // Strøget area
  {
    id: 'area7',
    name: 'Strøget Parking',
    polygon: [
      { latitude: 55.6785, longitude: 12.5690 },
      { latitude: 55.6790, longitude: 12.5700 },
      { latitude: 55.6780, longitude: 12.5710 },
      { latitude: 55.6775, longitude: 12.5700 },
    ],
  },
  // Rådhuspladsen area
  {
    id: 'area8',
    name: 'Rådhuspladsen Parking',
    polygon: [
      { latitude: 55.6730, longitude: 12.5685 },
      { latitude: 55.6735, longitude: 12.5695 },
      { latitude: 55.6725, longitude: 12.5705 },
      { latitude: 55.6720, longitude: 12.5695 },
    ],
  },
  // Christianshavn area
  {
    id: 'area9',
    name: 'Christianshavn Parking',
    polygon: [
      { latitude: 55.6780, longitude: 12.5705 },
      { latitude: 55.6785, longitude: 12.5715 },
      { latitude: 55.6775, longitude: 12.5725 },
      { latitude: 55.6770, longitude: 12.5715 },
    ],
  },
  // Tivoli area
  {
    id: 'area10',
    name: 'Tivoli Parking',
    polygon: [
      { latitude: 55.6705, longitude: 12.5705 },
      { latitude: 55.6710, longitude: 12.5715 },
      { latitude: 55.6700, longitude: 12.5725 },
      { latitude: 55.6695, longitude: 12.5715 },
    ],
  },
];
