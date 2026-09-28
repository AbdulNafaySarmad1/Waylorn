param([int]$Port = 15020, [int]$FirstValue = 4660)
$ErrorActionPreference = 'Stop'

# Serves device identification (0x2B/0x0E basic objects) and then one register read, which ends the run.
function Read-Exactly($stream, [int]$count) {
    $buffer = [byte[]]::new($count)
    $offset = 0
    while ($offset -lt $count) {
        $read = $stream.Read($buffer, $offset, $count - $offset)
        if ($read -eq 0) { throw 'Client closed before the complete Modbus request.' }
        $offset += $read
    }
    return , $buffer
}

function Send-Pdu($stream, [byte[]]$header, [byte[]]$pdu) {
    $response = [byte[]]::new(7 + $pdu.Length)
    $response[0] = $header[0]; $response[1] = $header[1]
    $response[4] = [byte](($pdu.Length + 1) -shr 8); $response[5] = [byte](($pdu.Length + 1) -band 255)
    $response[6] = $header[6]
    [Array]::Copy($pdu, 0, $response, 7, $pdu.Length)
    $stream.Write($response, 0, $response.Length)
}

$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Port)
$listener.Start()
try {
    $served = $false
    while (-not $served) {
        $client = $listener.AcceptTcpClient()
        try {
            $stream = $client.GetStream()
            $stream.ReadTimeout = 10000
            $stream.WriteTimeout = 10000
            $header = Read-Exactly $stream 7
            $length = ([int]$header[4] -shl 8) -bor $header[5]
            if ($header[2] -ne 0 -or $header[3] -ne 0 -or $length -lt 2 -or $length -gt 253) {
                throw 'Simulator received an invalid Modbus frame.'
            }
            $pdu = Read-Exactly $stream ($length - 1)
            if ($pdu[0] -eq 0x2B -and $pdu.Length -eq 4 -and $pdu[1] -eq 0x0E -and $pdu[2] -eq 1) {
                $body = [Collections.Generic.List[byte]]::new([byte[]](0x2B, 0x0E, 1, 1, 0, 0, 3))
                $objects = @('Waylorn Simulator', 'SIM-1', '1.0')
                for ($id = 0; $id -lt 3; $id++) {
                    $text = [Text.Encoding]::ASCII.GetBytes($objects[$id])
                    $body.Add([byte]$id); $body.Add([byte]$text.Length); $body.AddRange($text)
                }
                Send-Pdu $stream $header $body.ToArray()
                continue
            }
            $count = ([int]$pdu[3] -shl 8) -bor $pdu[4]
            if ($pdu.Length -ne 5 -or $pdu[0] -notin @(3, 4) -or $count -lt 1 -or $count -gt 125) {
                throw 'Simulator received an invalid or non-read Modbus request.'
            }
            $body = [byte[]]::new(2 + 2 * $count)
            $body[0] = $pdu[0]
            $body[1] = [byte](2 * $count)
            for ($i = 0; $i -lt $count; $i++) {
                $value = $FirstValue + $i
                if ($value -gt 65535) { throw 'Simulator value exceeds one register.' }
                $body[2 + 2 * $i] = [byte]($value -shr 8)
                $body[3 + 2 * $i] = [byte]($value -band 255)
            }
            Send-Pdu $stream $header $body
            $served = $true
        } finally { $client.Dispose() }
    }
} finally { $listener.Stop() }
