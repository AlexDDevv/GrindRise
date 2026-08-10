import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button } from 'react-native';

import { PlaceholderScreen } from '../../../components/PlaceholderScreen';
import type { WorkoutsStackParamList } from '../../../navigation/types';

export function WorkoutsHomeScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<WorkoutsStackParamList, 'WorkoutsHome'>>();

  return (
    <PlaceholderScreen
      title="Entraînements"
      description="Historique des séances (`workout_logs`), filtrable par sport."
    >
      <Button title="Logger une séance" onPress={() => navigation.navigate('LogWorkout')} />
    </PlaceholderScreen>
  );
}
