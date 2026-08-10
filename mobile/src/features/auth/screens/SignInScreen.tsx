import { Button } from 'react-native';

import { PlaceholderScreen } from '../../../components/PlaceholderScreen';
import { signInAsDev } from '../devSession';

export function SignInScreen() {
  return (
    <PlaceholderScreen
      title="Connexion"
      description="Supabase Auth (email + OTP / OAuth) sera branché ici."
    >
      <Button title="Continuer (session de dev)" onPress={signInAsDev} />
    </PlaceholderScreen>
  );
}
