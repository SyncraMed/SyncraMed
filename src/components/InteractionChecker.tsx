import { useState } from "react";
import { Button } from "./ui/button";
import ReactMarkdown from "react-markdown";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "./ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import {
  AlertTriangle,
  Shield,
  Loader2,
  Pill,
  Activity,
} from "lucide-react";
import { Alert, AlertDescription } from "./ui/alert";
import { projectId } from "../utils/supabase/info";

interface Medication {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
}

interface InteractionCheckerProps {
  medications: Medication[];
  accessToken: string;
}

export function InteractionChecker({
  medications,
  accessToken,
}: InteractionCheckerProps) {
  const [showResults, setShowResults] = useState(false);
  const [loading, setLoading] = useState(false);
  const [interactions, setInteractions] = useState("");
  const [error, setError] = useState("");

  const checkInteractions = async () => {
    if (medications.length < 2) {
      setInteractions(
        "⚠️ You need at least two medications to check for interactions.",
      );
      setShowResults(true);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-2e410764/check-interactions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ medications }),
        },
      );

      const data = await response.json();

      if (response.ok) {
        setInteractions(data.interactions);
        setShowResults(true);
      } else {
        setError(data.error || "Failed to check interactions.");
      }
    } catch (err) {
      console.error("Error checking interactions:", err);
      setError("An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Card className="bg-gradient-to-br from-blue-50 to-white border-blue-200 shadow-md">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2 text-lg font-semibold text-blue-900">
            <Activity className="w-5 h-5 text-blue-600" />
            Interaction Checker
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground text-center">
            Instantly analyze possible medication interactions
            using AI.
          </p>

          <Button
            onClick={checkInteractions}
            disabled={loading || medications.length === 0}
            className="w-full font-medium shadow-sm bg-blue-600 hover:bg-blue-700 text-white gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Checking Interactions...
              </>
            ) : (
              <>
                <AlertTriangle className="w-4 h-4" />
                Check Medication Interactions
              </>
            )}
          </Button>

          {error && (
            <Alert variant="destructive" className="mt-3">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Results Dialog */}
      <Dialog open={showResults} onOpenChange={setShowResults}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl shadow-lg border border-blue-100 bg-gradient-to-b from-white to-blue-50">
          <DialogHeader className="border-b border-blue-100 pb-3">
            <DialogTitle className="flex items-center gap-2 text-xl font-semibold text-blue-900">
              <Shield className="w-5 h-5 text-blue-700" />
              Medication Interaction Analysis
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              AI-powered analysis of your current medication
              list.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 mt-4">
            {/* Medical Disclaimer Paragraph */}
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-900 leading-relaxed">
              <p className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-700" />
                <span>
                  <strong>Medical Disclaimer:</strong> This
                  AI-generated information is for educational
                  purposes only. It is NOT a substitute for
                  medical advice. Always consult your doctor or
                  pharmacist before making any changes to your
                  medications or treatment.
                </span>
              </p>
            </div>

            <Card className="border-blue-100 shadow-sm">
              <CardHeader className="bg-blue-50 border-b border-blue-100">
                <CardTitle className="flex items-center gap-2 text-blue-800">
                  <Pill className="w-4 h-4 text-blue-700" />
                  Medications Analyzed
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-3">
                <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
                  {medications.map((med) => (
                    <li key={med.id}>
                      <span className="font-medium text-blue-900">
                        {med.name}
                      </span>{" "}
                      — {med.dosage} ({med.frequency})
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card className="border-blue-100 shadow-sm">
              <CardHeader className="bg-blue-50 border-b border-blue-100">
                <CardTitle className="flex items-center gap-2 text-blue-800">
                  <Activity className="w-4 h-4 text-blue-700" />
                  Analysis Results
                </CardTitle>
              </CardHeader>

              <CardContent className="pt-4">
                <div className="prose prose-blue max-w-none text-gray-800">
                  <ReactMarkdown
                    components={{
                      h1: ({ children }) => (
                        <h1 className="text-xl font-bold text-blue-800 mb-2">
                          {children}
                        </h1>
                      ),
                      h2: ({ children }) => (
                        <h2 className="text-lg font-semibold text-blue-700 mt-4 mb-2">
                          {children}
                        </h2>
                      ),
                      h3: ({ children }) => (
                        <h3 className="text-base font-semibold text-blue-600 mt-3 mb-1">
                          {children}
                        </h3>
                      ),
                      h4: ({ children }) => (
                        <h4 className="text-base font-medium text-blue-500 mt-2 mb-1">
                          {children}
                        </h4>
                      ),
                      p: ({ children }) => (
                        <p className="text-gray-700 leading-relaxed mb-2">
                          {children}
                        </p>
                      ),
                      ul: ({ children }) => (
                        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-3">
                          {children}
                        </ul>
                      ),
                      li: ({ children }) => <li>{children}</li>,
                      strong: ({ children }) => (
                        <strong className="font-semibold text-gray-900">
                          {children}
                        </strong>
                      ),
                    }}
                  >
                    {interactions}
                  </ReactMarkdown>
                </div>
              </CardContent>
            </Card>

            <Button
              onClick={() => setShowResults(false)}
              className="w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}