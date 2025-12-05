import { useState } from "react";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "./ui/card";
import {
  Store,
  ShoppingCart,
  Building2,
  Package,
  ShoppingBag,
} from "lucide-react"; // icons

export function RefillRequestPage({
  onBack,
}: {
  onBack: () => void;
}) {
  const [requestedMed, setRequestedMed] = useState("");
  const [selectedPharmacy, setSelectedPharmacy] = useState<
    string | null
  >(null);

  const pharmacies = [
    {
      name: "Publix",
      url: "https://account.publix.com/372cde5e-efa2-4da5-9b62-9ee9fd9c4bb8/b2c_1a_publixsigninmigration_rx/oauth2/v2.0/authorize?client_id=65a0d7dc-e288-453f-ad37-a1c4b9afbd9f&redirect_uri=https%3A%2F%2Frx.publix.com&response_type=code%20id_token&scope=openid&state=OpenIdConnect.AuthenticationProperties%3DgMOZpa9RQ0prAgVsS52DoTg1tTyPG8kHYE00lb8ZC_huQaVgqzrQ0SUaZNGwoGl200QEJzRoauDx0TvqO6MGD8gpoXMirb09zcU0zLcljvjcv1yIZnEeWcbZez8k4RYe7ouq0WwOvw7nOIAjmQ0-pV0DpMaYolFkWN6EhhGdFw4CtcKpt2m5bxNH-upLZL86XRoGSgCHPfYF3aCZlzkFkPAnhR2tsKNVcO5VBV-QKYCsSrAcRlKQQqpPQajVYzwWQTy0S-wOcEBnXVEt0Y-zoi_6-QCB1XY7uS6DPF5gDPDQDN2IntOC5Tfkuao-LAF_FK-PxM367xRzsejskGONo3esP8Jhzit3ZazjRtULYt3aQTe2QiYejfdtacj8TdaJYSFbNH6iPU9NDTP7rUNzmu8_BQZTy_szLDpA54ss50CZO47iZJTZbMf7thUr133fnk_4rDWYMCcjmNU5TS2kn3H51dImDqCqeeBtanl3eUSlnfLSixpKxseJXWBO1c-FwimJ1JQFrQBzzdHXXR3dV7fRD698AdVtrTfAAUOHYBlSLdwgsJxEdDjdENExkUtlQPXVzP1QrovuBHpytLYjs8T1rjVYuKf6G7vOLWu28BdTzDV03XST7hWzMhjsMQWA7E9hps5rXH0m42Ls-tDj69BBbTnXatscv9etSDIXT3LWfyiM92rmL75cQFNPlIG-YFnSv8k0AJvSI09ydr_QZeLZOrM&response_mode=form_post&nonce=638975332652394780.NGVjZDg3NDYtNjFlNS00MDYwLTk2NzEtNDdjNGNjNjgyM2NkNmVjNWFiYTgtNzU4OS00Njc2LThiM2YtN2M1ZTg5ZjJkYjIx&x-client-SKU=ID_NET461&x-client-ver=6.6.0.0",
      logo: "https://images.publixcdn.com/cms/images/publix/publix_brandmark.svg?la=en&h=59&w=59&hash=AD9C274D70D8C97DD0AE675A430531E2",
    },
    {
      name: "Walmart",
      url: "https://identity.walmart.com/account/login?tp=HealthAndWellness&client_id=5f3fb121-076a-45f6-9587-249f0bc160ff&redirect_uri=https%3A%2F%2Fwww.walmart.com%2Faccount%2FverifyToken&scope=openid+email+offline_access&tenant_id=elh9ie&state=%2Fcp%2Fpharmacy%2F5431&code_challenge=fM2HUIvoVCGsAlwVdGSIkUejykUSI_WOndWQByqV7JQ",
      logo: "https://i5.walmartimages.com/dfw/63fd9f59-14e2/9d304ce6-96de-4331-b8ec-c5191226d378/v1/spark-icon.svg",
    },
    {
      name: "CVS",
      url: "https://www.cvs.com/account-login/look-up?returnUrl=/pharmacy/rx/prescriptions",
      logo: "https://images.ctfassets.net/nu3qzhcv2o1c/1uWo4wzILxt7WqZAlfL2mO/2a029246adf2d8ed63db57e7f0ea3387/cvs-logo.svg",
    },
    {
      name: "Walgreens",
      url: "https://www.walgreens.com/login.jsp?ru=/pharmacy/fulfillment/rx-landing",
      logo: "https://www.walgreens.com/images/adaptive/livestyleguide/v5/icons/Branding.svg",
    },
    {
      name: "Amazon",
      url: "https://www.amazon.com/ax/claim?arb=265ff80e-be6e-4f37-9eb1-de56e45425aa",
      logo: "https://upload.wikimedia.org/wikipedia/commons/a/a9/Amazon_logo.svg",
    },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPharmacy) {
      alert("Please select a pharmacy.");
      return;
    }
    alert(
      `Refill request sent to ${selectedPharmacy} for ${requestedMed}`,
    );
    setRequestedMed("");
    setSelectedPharmacy(null);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-md mx-auto p-4">
        <Card>
          <CardHeader>
            <CardTitle>Request Medication Refill</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <p className="font-medium mb-2">
                  Select your pharmacy:
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {pharmacies.map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => {
                        setSelectedPharmacy(p.name);
                        window.open(p.url, "_blank");
                      }}
                      className={`flex flex-col items-center justify-center border rounded-xl p-3 hover:bg-accent transition ${
                        selectedPharmacy === p.name
                          ? "border-primary bg-accent"
                          : "border-gray-300"
                      }`}
                    >
                      <img
                        src={p.logo}
                        alt={p.name}
                        className="w-12 h-12 object-contain"
                      />
                      <span className="mt-1 text-sm">
                        {p.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <Button
                type="button"
                onClick={onBack}
                className="w-full"
              >
                Back to Dashboard
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}