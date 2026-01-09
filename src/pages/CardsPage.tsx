import { motion } from "framer-motion";
import Header from "@/components/layout/Header";
import MobileNav from "@/components/layout/MobileNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Plus, Lock, Eye, EyeOff, Snowflake, Settings } from "lucide-react";
import { useState } from "react";

// Mock cards data - in production this would come from the database
const mockCards = [
  {
    id: '1',
    type: 'virtual',
    last_four: '4532',
    brand: 'Visa',
    status: 'active',
    currency: 'USD',
    balance: 1250.00,
    expires: '12/27',
    color: 'gradient-primary',
  },
  {
    id: '2',
    type: 'virtual',
    last_four: '8921',
    brand: 'Mastercard',
    status: 'active',
    currency: 'CAD',
    balance: 500.00,
    expires: '06/26',
    color: 'bg-gradient-to-br from-purple-500 to-pink-500',
  },
];

const CardsPage = () => {
  const [showCardNumbers, setShowCardNumbers] = useState<Record<string, boolean>>({});

  const toggleCardNumber = (cardId: string) => {
    setShowCardNumbers(prev => ({ ...prev, [cardId]: !prev[cardId] }));
  };

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-8">
      <Header />
      
      <main className="container px-4 py-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-display font-bold text-foreground">My Cards</h1>
              <p className="text-muted-foreground">Manage your virtual and physical cards</p>
            </div>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              New Card
            </Button>
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {mockCards.map((card, index) => (
              <motion.div
                key={card.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className={`overflow-hidden ${card.color} text-white`}>
                  <CardContent className="p-6 relative">
                    {/* Card Background Pattern */}
                    <div className="absolute inset-0 opacity-10">
                      <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white blur-3xl" />
                      <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-white blur-2xl" />
                    </div>

                    <div className="relative z-10">
                      {/* Card Header */}
                      <div className="flex justify-between items-start mb-8">
                        <div>
                          <Badge variant="secondary" className="bg-white/20 text-white border-0">
                            {card.type === 'virtual' ? 'Virtual' : 'Physical'}
                          </Badge>
                        </div>
                        <div className="text-right">
                          <p className="text-white/70 text-sm">{card.brand}</p>
                        </div>
                      </div>

                      {/* Card Number */}
                      <div className="mb-6">
                        <div className="flex items-center gap-2">
                          <p className="font-mono text-xl tracking-wider">
                            {showCardNumbers[card.id] 
                              ? `4532 1234 5678 ${card.last_four}`
                              : `•••• •••• •••• ${card.last_four}`
                            }
                          </p>
                          <button
                            onClick={() => toggleCardNumber(card.id)}
                            className="p-1 hover:bg-white/10 rounded"
                          >
                            {showCardNumbers[card.id] 
                              ? <EyeOff className="w-4 h-4" />
                              : <Eye className="w-4 h-4" />
                            }
                          </button>
                        </div>
                      </div>

                      {/* Card Details */}
                      <div className="flex justify-between items-end">
                        <div>
                          <p className="text-white/70 text-xs mb-1">Balance</p>
                          <p className="text-2xl font-display font-bold">
                            ${card.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-white/70 text-xs mb-1">Expires</p>
                          <p className="font-mono">{card.expires}</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Card Actions */}
                <div className="flex gap-2 mt-3">
                  <Button variant="outline" size="sm" className="flex-1">
                    <Lock className="w-4 h-4 mr-1" />
                    Lock
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1">
                    <Snowflake className="w-4 h-4 mr-1" />
                    Freeze
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1">
                    <Settings className="w-4 h-4 mr-1" />
                    Settings
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Empty State for requesting physical card */}
          <Card>
            <CardContent className="py-8 text-center">
              <CreditCard className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">Get a Physical Card</h3>
              <p className="text-muted-foreground mb-4">
                Order a physical debit card for in-store purchases and ATM withdrawals
              </p>
              <Button variant="outline">
                Request Physical Card
              </Button>
            </CardContent>
          </Card>

          {/* Card Features */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center mb-3">
                  <Lock className="w-5 h-5 text-primary" />
                </div>
                <h4 className="font-semibold mb-1">Instant Lock</h4>
                <p className="text-sm text-muted-foreground">
                  Lock your card instantly from the app if it's lost or stolen
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center mb-3">
                  <CreditCard className="w-5 h-5 text-primary" />
                </div>
                <h4 className="font-semibold mb-1">Virtual Cards</h4>
                <p className="text-sm text-muted-foreground">
                  Create unlimited virtual cards for secure online shopping
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center mb-3">
                  <Settings className="w-5 h-5 text-primary" />
                </div>
                <h4 className="font-semibold mb-1">Spending Limits</h4>
                <p className="text-sm text-muted-foreground">
                  Set daily and monthly spending limits for better control
                </p>
              </CardContent>
            </Card>
          </div>
        </motion.div>
      </main>

      <MobileNav />
    </div>
  );
};

export default CardsPage;
