// Copyright 2019 by Wolfgang Stubig. See license.txt distributed with this file.

// Implements the PlusROM online functions

jt.CartridgePlusFunctions = function(rom, format) {
"use strict";

    function init(self) {
        self.rom = rom;
        self.format = format;
        bytes = rom.content;        // uses the content of the ROM directly
        self.bytes = bytes;
        out_buffer_write_pointer = 0;
        out_buffer_send_pointer = 0;
        receive_buffer_write_pointer = 0;
        receive_buffer_read_pointer = 0;
        plusStoreID = localStorage.getItem("plusStoreID"); 
        if(plusStoreID == null){
            var username = window.prompt("This ROM apparently uses PlusROM functions. Please insert your nickname for the back end requests (max. 10 chars)." );
            plusStoreID = username.trim().substr(0, 10) + " WExxxxxxxxxxxxxxxxxxxxxx".replace(/[x]/g, function(c) { return Math.floor(Math.random() * 10).toString(); });
            localStorage.setItem("plusStoreID", plusStoreID);
        }
        
        var i=0;
        path = "";
        host = "";
        
        while (jt.CartridgePlusFunctions.isValidPathChar(bytes[i])){
            path +=  String.fromCharCode(bytes[i++]);
        }
        i++;
        while (jt.CartridgePlusFunctions.isValidHostChar(bytes[i])){
            host +=  String.fromCharCode(bytes[i++]);
        }
        url = location.protocol + "//" + host + "/" + path;
    }

    this.read = function(maskedAddress) {
        // Check for Extra Buffer reads
        if (maskedAddress == 0x0ff2){				   // Receive buffer
            var last_pos = receive_buffer_read_pointer;
            if(receive_buffer_read_pointer < receive_buffer_write_pointer){
                if( ++receive_buffer_read_pointer > 255)
                    receive_buffer_read_pointer = 0;
            }
            return receive_buffer[last_pos];
        }else if (maskedAddress == 0x0ff3){		// Receive buffer length should always be >= 0
            return receive_buffer_write_pointer - receive_buffer_read_pointer;
        }else{
            return false; // nothing todo for PlusFunctions
        }
    };

    this.write = function(maskedAddress, val) {
        // Check for Out Buffer writes
        if (maskedAddress == 0x0ff0 ){
            out_buffer[out_buffer_write_pointer++] = val;
            if (out_buffer_write_pointer > 255)
                out_buffer_write_pointer = 0;
        }else if (maskedAddress == 0x0ff1 ){

            var req = new XMLHttpRequest();
            req.open("POST", url, true);
            req.setRequestHeader("PlusStore-ID", plusStoreID);
            req.responseType = "arraybuffer";
            req.timeout = DEFAULT_TIMEOUT;
            req.onload = function () {
                if (req.status === 200){
                  var raw_response = new Uint8Array(req.response);
                  var length  = raw_response[0];
                  jt.Util.arrayCopy(raw_response, 1, receive_buffer, receive_buffer_write_pointer, length);
                  receive_buffer_write_pointer += length;
                }else{
                  req.onerror();
                }
            };
            req.onerror = req.ontimeout = function () {
                console.log(" error 1 :" + req.status + " " + req.statusText);
            };
            // only send from byte 0 to out_buffer_write_pointer = 0 as binary !
            var sendBinaryString = "";
            for (var i = 0; out_buffer_write_pointer >= i; i++ ){
                sendBinaryString += String.fromCharCode(out_buffer[i])
            }
            req.send(sendBinaryString);

            out_buffer_write_pointer = 0;
        }
        else{
            return false;
        }
        return true;
    };

     // Savestate  -------------------------------------------

    this.saveState = function() {
        return {
            rb: jt.Util.compressInt8BitArrayToStringBase64(receive_buffer),
            ob: jt.Util.compressInt8BitArrayToStringBase64(out_buffer),
            h: host,
            p: path,
            pid: plusStoreID,
            u: url
            
        };
    };

    this.loadState = function(state) {
        receive_buffer = jt.Util.uncompressStringBase64ToInt8BitArray(state.rb, receive_buffer);
        out_buffer = jt.Util.uncompressStringBase64ToInt8BitArray(state.ob, out_buffer);
        plusStoreID = state.pid;
        url = state.u;
    };


    var plusStoreID;
    var out_buffer_write_pointer, out_buffer_send_pointer;
    var out_buffer = jt.Util.arrayFill(new Array(256), 0);
    var receive_buffer_write_pointer, receive_buffer_read_pointer;
    var receive_buffer = jt.Util.arrayFill(new Array(256), 0);
    var host, path, url;
    var DEFAULT_TIMEOUT = 15000;

};

jt.CartridgePlusFunctions.prototype = jt.Cartridge.base;

jt.CartridgePlusFunctions.recreateFromSaveState = function(state, prevCart) {
    var cart = prevCart || new jt.CartridgePlusFunctions();
    cart.loadState(state);
    return cart;
};

jt.CartridgePlusFunctions.isValidHostChar = function(cc) {
    return ( cc == 45 || cc == 46 || (cc > 47 && cc < 58) || (cc > 64 && cc < 91) || (cc > 96 && cc < 122) );
};

    /* 
     * basicly these Chars are allowed in path of URI:
     * pchar       = unreserved / pct-encoded / sub-delims / ":" / "@"
     * pct-encoded = "%" HEXDIG HEXDIG
     * unreserved  = ALPHA / DIGIT / "-" / "." / "_" / "~"
     * sub-delims  = "!" / "$" / "&" / "'" / "(" / ")"
     *             / "*" / "+" / "," / ";" / "="
     *             
     * but we dont't allow Searchstring chars too
     */
jt.CartridgePlusFunctions.isValidPathChar = function(cc) {
    return ((cc > 44 && cc < 58) || (cc > 64 && cc < 91) || (cc > 96 && cc < 122) );
};

jt.CartridgePlusFunctions.checkROM = function(rom) {
    var pointerNMI = rom.content.length - 5;
    var i = ((rom.content[pointerNMI--] - 16) * 256 ) + rom.content[pointerNMI] , host = "", path = "";

    while (i < rom.content.length && jt.CartridgePlusFunctions.isValidPathChar(rom.content[i])){
        path +=  String.fromCharCode(rom.content[i++]);
    }
    if(i >= rom.content.length || rom.content[i] != 0){
        jt.Util.warning("Wrong delimiter in path! : 2 " + i);
        return false;
    }
    
    i++;
    while (i < rom.content.length && jt.CartridgePlusFunctions.isValidHostChar(rom.content[i])){
        host +=  String.fromCharCode(rom.content[i++]);
    }
    if(i >= rom.content.length || rom.content[i] != 0 || host.length < 3 || host.indexOf(".") == -1){ // we do not allow dotless hostnames or dotless IP Adress strings. API on TLD not possible
        jt.Util.warning("Wrong delimiter, too short or dotless hostname!");
        return false;
    }
    
    return true;
};
