param([int]$Port = 15020, [int]$FirstValue = 4660)
$ErrorActionPreference = 'Stop'
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Port)
$listener.Start()
try {
    $client = $listener.AcceptTcpClient()
    try {
        $stream = $client.GetStream()
        $stream.ReadTimeout = 10000
        $stream.WriteTimeout = 10000
        $request = [byte[]]::new(12)
        $offset = 0
        while ($offset -lt $request.Length) {
            $read = $stream.Read($request, $offset, $request.Length - $offset)
            if ($read -eq 0) { throw 'Client closed before the complete Modbus request.' }
            $offset += $read
        }
        $count = ($request[10] -shl 8) -bor $request[11]
        if ($request[2] -ne 0 -or $request[3] -ne 0 -or $request[4] -ne 0 -or
            $request[5] -ne 6 -or $request[7] -notin @(3, 4) -or $count -lt 1 -or $count -gt 125) {
            throw 'Simulator received an invalid or non-read Modbus request.'
        }
        $response = [byte[]]::new(9 + 2 * $count)
        $response[0] = $request[0]; $response[1] = $request[1]
        $length = 3 + 2 * $count
        $response[4] = [byte]($length -shr 8); $response[5] = [byte]($length -band 255)
        $response[6] = $request[6]; $response[7] = $request[7]
        $response[8] = [byte](2 * $count)
        for ($i = 0; $i -lt $count; $i++) {
            $value = $FirstValue + $i
            if ($value -gt 65535) { throw 'Simulator value exceeds one register.' }
            $response[9 + 2 * $i] = [byte]($value -shr 8)
            $response[10 + 2 * $i] = [byte]($value -band 255)
        }
        $stream.Write($response, 0, $response.Length)
    } finally { $client.Dispose() }
} finally { $listener.Stop() }
