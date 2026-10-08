import AsyncStorage from '@react-native-async-storage/async-storage';
import { createPracticeDraftStore } from './practice-drafts';
export const practiceDrafts = createPracticeDraftStore(AsyncStorage);
