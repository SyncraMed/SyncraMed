import { useState, useRef } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { Camera, Keyboard } from 'lucide-react'

interface AddMedicationModalProps {
  onClose: () => void
  onAdd: (medication: { name: string; dosage: string; frequency: string; reminderTime?: string; refillDate?: string; supplyDays?: string }) => void
}

export function AddMedicationModal({ onClose, onAdd }: AddMedicationModalProps) {
  const [name, setName] = useState('')
  const [dosage, setDosage] = useState('')
  const [frequency, setFrequency] = useState('')
  const [reminderTime, setReminderTime] = useState('')
  const [refillDate, setRefillDate] = useState('')
  const [supplyDays, setSupplyDays] = useState('')
  const [scannedImage, setScannedImage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!name || !dosage || !frequency) {
      alert('Please fill in all fields')
      return
    }

    onAdd({ 
      name, 
      dosage, 
      frequency,
      reminderTime: reminderTime || undefined,
      refillDate: refillDate || undefined,
      supplyDays: supplyDays || undefined
    })
  }

  const handleCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setScannedImage(reader.result as string)
        // In a real app, you would use OCR here to extract text from the image
        alert('Image captured! Please manually enter the medication details below. (OCR feature would be implemented in production)')
      }
      reader.readAsDataURL(file)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <CardTitle>Add Medication</CardTitle>
          <CardDescription>Add a new medication to track</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="manual" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="manual" className="gap-2">
                <Keyboard className="w-4 h-4" />
                Manual Entry
              </TabsTrigger>
              <TabsTrigger value="scan" className="gap-2">
                <Camera className="w-4 h-4" />
                Scan Label
              </TabsTrigger>
            </TabsList>

            <TabsContent value="manual" className="space-y-4">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="name" className="block mb-2">Medication Name</label>
                  <Input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Lisinopril"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="dosage" className="block mb-2">Dosage</label>
                  <Input
                    id="dosage"
                    type="text"
                    value={dosage}
                    onChange={(e) => setDosage(e.target.value)}
                    placeholder="e.g., 10mg"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="frequency" className="block mb-2">Times per Day</label>
                  <Input
                    id="frequency"
                    type="number"
                    min="1"
                    max="10"
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value)}
                    placeholder="e.g., 2"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="reminderTime">Daily Reminder Time (Optional)</Label>
                  <Input
                    id="reminderTime"
                    type="time"
                    value={reminderTime}
                    onChange={(e) => setReminderTime(e.target.value)}
                    className="mt-2"
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    Set a time to be reminded to take this medication
                  </p>
                </div>
                <div className="border-t pt-4 space-y-3">
                  <p className="text-sm font-medium">Refill Tracking (Optional)</p>
                  <div>
                    <Label htmlFor="refillDate">Last Refill Date</Label>
                    <Input
                      id="refillDate"
                      type="date"
                      value={refillDate}
                      onChange={(e) => setRefillDate(e.target.value)}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label htmlFor="supplyDays">Supply Duration (Days)</Label>
                    <Input
                      id="supplyDays"
                      type="number"
                      min="1"
                      value={supplyDays}
                      onChange={(e) => setSupplyDays(e.target.value)}
                      placeholder="e.g., 30"
                      className="mt-2"
                    />
                    <p className="text-sm text-muted-foreground mt-1">
                      Track when you'll need a refill. We'll calculate days remaining based on your last refill date and supply duration.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" className="flex-1">
                    Add Medication
                  </Button>
                  <Button type="button" variant="outline" onClick={onClose}>
                    Cancel
                  </Button>
                </div>
              </form>
            </TabsContent>

            <TabsContent value="scan" className="space-y-4">
              <div className="text-center space-y-4">
                <p className="text-muted-foreground">
                  Take a photo of your medication label to automatically extract information
                </p>
                
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleCameraCapture}
                  className="hidden"
                />
                
                <Button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full gap-2"
                >
                  <Camera className="w-5 h-5" />
                  Open Camera
                </Button>

                {scannedImage && (
                  <div className="mt-4">
                    <img src={scannedImage} alt="Scanned medication" className="w-full rounded-md mb-4" />
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                  <div>
                    <label htmlFor="name-scan" className="block mb-2">Medication Name</label>
                    <Input
                      id="name-scan"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g., Lisinopril"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="dosage-scan" className="block mb-2">Dosage</label>
                    <Input
                      id="dosage-scan"
                      type="text"
                      value={dosage}
                      onChange={(e) => setDosage(e.target.value)}
                      placeholder="e.g., 10mg"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="frequency-scan" className="block mb-2">Times per Day</label>
                    <Input
                      id="frequency-scan"
                      type="number"
                      min="1"
                      max="10"
                      value={frequency}
                      onChange={(e) => setFrequency(e.target.value)}
                      placeholder="e.g., 2"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="reminderTime-scan">Daily Reminder Time (Optional)</Label>
                    <Input
                      id="reminderTime-scan"
                      type="time"
                      value={reminderTime}
                      onChange={(e) => setReminderTime(e.target.value)}
                      className="mt-2"
                    />
                    <p className="text-sm text-muted-foreground mt-1">
                      Set a time to be reminded to take this medication
                    </p>
                  </div>
                  <div className="border-t pt-4 space-y-3">
                    <p className="text-sm font-medium">Refill Tracking (Optional)</p>
                    <div>
                      <Label htmlFor="refillDate-scan">Last Refill Date</Label>
                      <Input
                        id="refillDate-scan"
                        type="date"
                        value={refillDate}
                        onChange={(e) => setRefillDate(e.target.value)}
                        className="mt-2"
                      />
                    </div>
                    <div>
                      <Label htmlFor="supplyDays-scan">Supply Duration (Days)</Label>
                      <Input
                        id="supplyDays-scan"
                        type="number"
                        min="1"
                        value={supplyDays}
                        onChange={(e) => setSupplyDays(e.target.value)}
                        placeholder="e.g., 30"
                        className="mt-2"
                      />
                      <p className="text-sm text-muted-foreground mt-1">
                        Track when you'll need a refill. We'll calculate days remaining based on your last refill date and supply duration.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" className="flex-1">
                      Add Medication
                    </Button>
                    <Button type="button" variant="outline" onClick={onClose}>
                      Cancel
                    </Button>
                  </div>
                </form>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
