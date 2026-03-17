import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { authenticateUser, setCurrentUser } from '@/lib/auth';
import { Lock, User } from 'lucide-react';

interface AuthProps {
  onLogin: () => void;
}

export function Auth({ onLogin }: AuthProps) {
  const [username, setUsername] = useState('demo');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const user = await authenticateUser(username, pin);
      if (user) {
        setCurrentUser(user);
        toast.success(`Welcome, ${user.username}!`);
        onLogin();
      } else {
        toast.error('Invalid credentials. Try demo/1234');
      }
    } catch (error) {
      toast.error('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 gradient-hero">
      <Card className="w-full max-w-md p-8 shadow-strong">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-primary mb-2">DigBahi</h1>
          <p className="text-muted-foreground">Professional Accounting for Indian SMEs</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-2">
            <label htmlFor="username" className="text-sm font-medium flex items-center gap-2">
              <User className="w-4 h-4" />
              Username
            </label>
            <Input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              required
              className="touch-friendly"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="pin" className="text-sm font-medium flex items-center gap-2">
              <Lock className="w-4 h-4" />
              PIN
            </label>
            <Input
              id="pin"
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Enter 4-digit PIN"
              maxLength={4}
              required
              className="touch-friendly"
            />
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full touch-friendly gradient-hero"
            size="lg"
          >
            {loading ? 'Logging in...' : 'Login'}
          </Button>

          <div className="text-center text-sm text-muted-foreground border-t pt-4">
            <p>Demo credentials:</p>
            <p className="font-mono mt-1">Username: demo | PIN: 1234</p>
          </div>
        </form>
      </Card>
    </div>
  );
}
