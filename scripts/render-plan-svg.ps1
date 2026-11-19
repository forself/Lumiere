param([Parameter(Mandatory=$true)][string]$InputSvg,[Parameter(Mandatory=$true)][string]$OutputPng)
# Local vector-plan raster export using Windows' existing drawing runtime.
# Intentionally supports only this report's static shapes; no scripts or external resources.
Add-Type -AssemblyName System.Drawing
[xml]$svg = Get-Content -LiteralPath $InputSvg -Raw -Encoding utf8
$root = $svg.DocumentElement
$bitmap = [System.Drawing.Bitmap]::new([int]$root.width,[int]$root.height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
function Number($node,$name,$fallback=0) { if ($node.HasAttribute($name)) { return [single]::Parse($node.GetAttribute($name),[Globalization.CultureInfo]::InvariantCulture) }; return [single]$fallback }
function Draw-Node($node,$inherited) {
    if ($node.NodeType -ne 'Element') { return }
    if ($node.LocalName -notin @('svg','g','rect','circle','line','path','text')) { throw "Unsupported SVG element: $($node.LocalName)" }
    $state = $graphics.Save()
    try {
        if ($node.HasAttribute('transform')) {
            if ($node.GetAttribute('transform') -notmatch '^translate\(([\d.\-]+) ([\d.\-]+)\)$') { throw 'Unsupported transform' }
            $graphics.TranslateTransform([single]$Matches[1],[single]$Matches[2])
        }
        $fill = if ($node.HasAttribute('fill')) { $node.GetAttribute('fill') } else { $inherited }
        $brush = if ($fill -and $fill -ne 'none') { [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml($fill)) } else { $null }
        $pen = if ($node.HasAttribute('stroke') -and $node.GetAttribute('stroke') -ne 'none') { [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml($node.GetAttribute('stroke')),(Number $node 'stroke-width' 1)) } else { $null }
        if ($pen -and $node.HasAttribute('stroke-dasharray')) { $pen.DashPattern = [single[]]($node.GetAttribute('stroke-dasharray').Split(' ') | ForEach-Object { [single]$_ / $pen.Width }) }
        try {
            switch ($node.LocalName) {
                'rect' { $r=[System.Drawing.RectangleF]::new((Number $node 'x'),(Number $node 'y'),(Number $node 'width'),(Number $node 'height')); if($brush){$graphics.FillRectangle($brush,$r)};if($pen){$graphics.DrawRectangle($pen,$r.X,$r.Y,$r.Width,$r.Height)} }
                'circle' { $radius=Number $node 'r';$r=[System.Drawing.RectangleF]::new((Number $node 'cx')-$radius,(Number $node 'cy')-$radius,2*$radius,2*$radius);if($brush){$graphics.FillEllipse($brush,$r)};if($pen){$graphics.DrawEllipse($pen,$r)} }
                'line' { if($pen){$graphics.DrawLine($pen,(Number $node 'x1'),(Number $node 'y1'),(Number $node 'x2'),(Number $node 'y2'))} }
                'path' {
                    $tokens=[regex]::Matches($node.GetAttribute('d'),'[ML]|-?\d+(?:\.\d+)?').Value
                    $x=0.;$y=0.;for($i=0;$i -lt $tokens.Count;$i+=3){$nx=[single]::Parse($tokens[$i+1],[Globalization.CultureInfo]::InvariantCulture);$ny=[single]::Parse($tokens[$i+2],[Globalization.CultureInfo]::InvariantCulture);if($tokens[$i] -eq 'L' -and $pen){$graphics.DrawLine($pen,[single]$x,[single]$y,$nx,$ny)};$x=$nx;$y=$ny}
                }
                'text' {
                    $size=Number $node 'font-size' 15
                    $style=if($node.GetAttribute('font-weight') -eq 'bold'){[System.Drawing.FontStyle]::Bold}else{[System.Drawing.FontStyle]::Regular}
                    $font=[System.Drawing.Font]::new('Microsoft JhengHei',$size,$style,[System.Drawing.GraphicsUnit]::Pixel)
                    try { if($brush){$graphics.DrawString($node.InnerText,$font,$brush,(Number $node 'x'),(Number $node 'y')-$size*1.02)} } finally { $font.Dispose() }
                }
            }
            foreach($child in $node.ChildNodes){Draw-Node $child $fill}
        } finally { if($pen){$pen.Dispose()};if($brush){$brush.Dispose()} }
    } finally { $graphics.Restore($state) }
}
try { Draw-Node $root '#000000';$bitmap.Save([IO.Path]::GetFullPath($OutputPng),[System.Drawing.Imaging.ImageFormat]::Png) } finally { $graphics.Dispose();$bitmap.Dispose() }
