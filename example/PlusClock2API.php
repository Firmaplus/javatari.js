<?php

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    header('Content-Type: application/octet-stream');
    if( strncmp( $_SERVER['HTTP_USER_AGENT'], "PlusCart/v", 10 ) != 0)
        header('Access-Control-Allow-Origin: *');
    header('Content-Length: 4' ); //
    $h = 24 - intval(date("G"));
    $m = 60 - intval(date("i"));
    $s = 60 - intval(date("s"));
    echo chr(3).chr($h).chr($m).chr($s); // First byte ist Content-Length of the rest..
}else{
    echo "Wrong Request Method!\r\n";
}
?>