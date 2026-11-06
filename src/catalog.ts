import type { AlbumDefinition } from './types'

export const DEFAULT_ALBUMS: AlbumDefinition[] = [
  { id: 'people', name: 'People', prompt: 'a photo of people, friends or family', color: '#ee7c52', keywords: ['person', 'people', 'family', 'friend', 'portrait', 'selfie', 'wedding', 'baby'] },
  { id: 'pets', name: 'Animals', prompt: 'a photo of a pet or animal', color: '#a56dd4', keywords: ['pet', 'dog', 'cat', 'animal', 'puppy', 'kitten', 'bird'] },
  { id: 'food', name: 'Food', prompt: 'a photo of food, a meal or a drink', color: '#e7a943', keywords: ['food', 'meal', 'lunch', 'dinner', 'coffee', 'cake', 'restaurant'] },
  { id: 'nature', name: 'Nature', prompt: 'a photo of nature, plants, mountains or the sea', color: '#67996b', keywords: ['nature', 'tree', 'flower', 'mountain', 'beach', 'sea', 'sunset', 'forest'] },
  { id: 'travel', name: 'Travel', prompt: 'a travel photo of a place, landmark or city', color: '#3c8fa0', keywords: ['travel', 'trip', 'vacation', 'hotel', 'city', 'landmark', 'flight'] },
  { id: 'documents', name: 'Documents', prompt: 'a photo of a document, receipt, book or handwritten notes', color: '#6285b6', keywords: ['document', 'receipt', 'invoice', 'paper', 'note', 'scan', 'book'] },
  { id: 'screenshots', name: 'Screenshots', prompt: 'a screenshot of an app, website or computer screen', color: '#696f7d', keywords: ['screenshot', 'screen shot', 'capture', 'img_'] },
  { id: 'vehicles', name: 'Vehicles', prompt: 'a photo of a car, motorbike, train or other vehicle', color: '#bd645e', keywords: ['car', 'bike', 'motor', 'vehicle', 'train', 'plane'] },
  { id: 'events', name: 'Events', prompt: 'a photo of a party, concert, celebration or event', color: '#d86d91', keywords: ['event', 'party', 'birthday', 'concert', 'festival', 'celebration'] },
  { id: 'other', name: 'Other', prompt: 'an uncategorized miscellaneous photo', color: '#9c9589', keywords: [] },
]

export const ACCEPTED_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif', 'heic', 'heif', 'tif', 'tiff']
export const ACCEPTED_VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'm4v', 'avi', 'mkv', 'mpeg', 'mpg', '3gp']
export const MAX_ARCHIVE_BYTES = 1024 * 1024 * 750
export const MAX_ENTRY_BYTES = 1024 * 1024 * 250
export const MAX_ARCHIVE_ENTRIES = 5000
