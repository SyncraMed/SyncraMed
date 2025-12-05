import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { ConditionInfoModal } from "./ConditionInfoModal";
import { PlusCircle, X, ArrowLeft, Trash2, Heart, Info } from "lucide-react";
import { projectId } from "../utils/supabase/info";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./ui/alert-dialog";

interface MedicalConditionsPageProps {
  accessToken: string;
  onBack: () => void;
}

export function MedicalConditionsPage({
  accessToken,
  onBack,
}: MedicalConditionsPageProps) {
  const [conditions, setConditions] = useState<string[]>([]);
  const [newCondition, setNewCondition] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedCondition, setSelectedCondition] = useState<string | null>(null);

  useEffect(() => {
    loadConditions();
  }, []);

  const loadConditions = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-2e410764/medical-conditions`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );
      const data = await response.json();
      if (response.ok) {
        setConditions(data.conditions || []);
      } else {
        console.error("Failed to load conditions:", data.error);
      }
    } catch (error) {
      console.error("Error loading conditions:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddCondition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCondition.trim()) return;

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-2e410764/medical-conditions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ condition: newCondition.trim() }),
        },
      );
      const data = await response.json();
      if (response.ok) {
        setConditions([...conditions, newCondition.trim()]);
        setNewCondition("");
      } else {
        console.error("Failed to add condition:", data.error);
        alert("Failed to add condition");
      }
    } catch (error) {
      console.error("Error adding condition:", error);
      alert("Failed to add condition");
    }
  };

  const handleRemoveCondition = async (condition: string) => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-2e410764/medical-conditions`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ condition }),
        },
      );
      if (response.ok) {
        setConditions(conditions.filter((c) => c !== condition));
      } else {
        console.error("Failed to remove condition");
        alert("Failed to remove condition");
      }
    } catch (error) {
      console.error("Error removing condition:", error);
      alert("Failed to remove condition");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto p-4">
        <Button
          variant="ghost"
          onClick={onBack}
          className="mb-4 gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Button>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Medical Conditions</CardTitle>
            <CardDescription>
              Track your medical conditions and health history
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : (
              <>
                {conditions.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">
                    No medical conditions recorded yet
                  </p>
                ) : (
                  <div className="space-y-3 mb-4">
                    {conditions.map((condition, index) => (
                      <Card key={index} className="p-4 hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-primary/10 rounded-lg">
                            <Heart className="w-5 h-5 text-primary" />
                          </div>
                          
                          <div className="flex-1">
                            <h3 className="font-semibold text-gray-900">
                              {condition}
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              Medical Condition
                            </p>
                          </div>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedCondition(condition)}
                            className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                            title="View information"
                          >
                            <Info className="w-4 h-4" />
                          </Button>

                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle className="text-red-700">
                                  Remove Condition
                                </AlertDialogTitle>
                                <AlertDialogDescription className="text-gray-700">
                                  Are you sure you want to remove "{condition}" from your medical conditions?{" "}
                                  <span className="font-medium text-red-600">
                                    This action cannot be undone.
                                  </span>
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleRemoveCondition(condition)}
                                  className="bg-red-600 hover:bg-red-700 text-white"
                                >
                                  Remove
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Add New Condition</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddCondition} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="condition-name">Condition Name</Label>
                <Input
                  id="condition-name"
                  value={newCondition}
                  onChange={(e) => setNewCondition(e.target.value)}
                  placeholder="e.g., Hypertension"
                  className="w-full"
                />
                <p className="text-sm text-muted-foreground">
                  Enter the name of your medical condition
                </p>
              </div>
              <Button type="submit" className="w-full gap-2">
                <PlusCircle className="w-5 h-5" />
                Add Condition
              </Button>
            </form>
          </CardContent>
        </Card>

        {selectedCondition && (
          <ConditionInfoModal
            conditionName={selectedCondition}
            accessToken={accessToken}
            onClose={() => setSelectedCondition(null)}
          />
        )}
      </div>
    </div>
  );
}