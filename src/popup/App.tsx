import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function App() {
  return (
    <div className="w-[420px] p-4">
      <Card>
        <CardHeader>
          <CardTitle>Strada</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Strada — ready</p>
        </CardContent>
      </Card>
    </div>
  )
}
