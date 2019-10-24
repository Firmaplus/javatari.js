// Copyright 2019 by Wolfgang Stubig. See license.txt distributed with this file.

// Implements the 4K "PLS" PlusROM with online functions

jt.CartridgePLS = function(rom, format) {
"use strict";

    function init(self) {
        self.rom = rom;
        self.format = format;
        bytes = rom.content;        // uses the content of the ROM directly
        self.bytes = bytes;
        isPlus32 = bytes.length == 32768;
        baseBankSwitchAddress = 0x0ff4;
        topBankSwitchAddress = 0x0ffb;
        
        extraRAMSize = isPlus32 ? 128:null;
        extraRAM = isPlus32 ? jt.Util.arrayFill(new Array(extraRAMSize), 0) : null;
            
        out_buffer_write_pointer = 0;
        out_buffer_send_pointer = 0;
        receive_buffer_write_pointer = 0;
        receive_buffer_read_pointer = 0;
        
        var i=0;
        path = "";
        host = "";
        
        while (jt.CartridgePLS.isValidPathChar(bytes[i])){
            path +=  String.fromCharCode(bytes[i++]);
        }
        i++;
        while (jt.CartridgePLS.isValidHostChar(bytes[i])){
            host +=  String.fromCharCode(bytes[i++]);
        }
        url = location.protocol + "//" + host + "/" + path;
    }

    this.read = function(address) {
        var maskedAddress = maskAddress(address);
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
        }else if (isPlus32 && (maskedAddress >= extraRAMSize) && (maskedAddress < extraRAMSize * 2)){
            return extraRAM[maskedAddress - extraRAMSize];  // extra RAM
        }else{
            return bytes[bankAddressOffset + maskedAddress];	    // ROM
        }
    };

    this.write = function(address, val) {
        var maskedAddress = maskAddress(address);
        // Check for Out Buffer writes
        if (maskedAddress == 0x0ff0 ){
            out_buffer[out_buffer_write_pointer++] = val;
            if (out_buffer_write_pointer > 255)
                out_buffer_write_pointer = 0;
        }else if (maskedAddress == 0x0ff1 ){

            var req = new XMLHttpRequest();
            req.open("POST", url, true);
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
            for (var i = 0; i++; out_buffer_write_pointer >= i ){
                sendBinaryString += String.fromCharCode(out_buffer[i])
            }
            req.send(sendBinaryString);

            out_buffer_write_pointer = 0;
        }
        // Check for Extra RAM writes and then turn superChip mode on
        else if (isPlus32 && maskedAddress < extraRAMSize ) {
            extraRAM[maskedAddress] = val;
        }


    };

    var maskAddress = function(address) {
        var maskedAddress = address & ADDRESS_MASK;
        // Check and perform bank-switch as necessary
        if (maskedAddress >= baseBankSwitchAddress && maskedAddress <= topBankSwitchAddress)
            bankAddressOffset = BANK_SIZE * (maskedAddress - baseBankSwitchAddress);
        return maskedAddress;
    };

    // Savestate  -------------------------------------------

    this.saveState = function() {
        return {
            f: this.format.name,
            r: this.rom.saveState(),
            b:  jt.Util.compressInt8BitArrayToStringBase64(bytes),
            bo: bankAddressOffset,
            bb: baseBankSwitchAddress,
            es: extraRAMSize,
            tb: topBankSwitchAddress,
            s: isPlus32,
            e: extraRAM && jt.Util.compressInt8BitArrayToStringBase64(extraRAM),
            rb: jt.Util.compressInt8BitArrayToStringBase64(receive_buffer),
            ob: jt.Util.compressInt8BitArrayToStringBase64(out_buffer),
            h: host,
            p: path
            
        };
    };

    this.loadState = function(state) {
        this.format = jt.CartridgeFormats[state.f];
        this.rom = jt.ROM.loadState(state.r);
        bytes = jt.Util.uncompressStringBase64ToInt8BitArray(state.b, bytes);
        this.bytes = bytes;
        bankAddressOffset = state.bo;
        baseBankSwitchAddress = state.bb;
        extraRAMSize = state.es;
        topBankSwitchAddress =  state.tb;
        isPlus32 = !!state.s;
        extraRAM = state.e && jt.Util.uncompressStringBase64ToInt8BitArray(state.e, extraRAM);
        receive_buffer = jt.Util.uncompressStringBase64ToInt8BitArray(state.rb, receive_buffer);
        out_buffer = jt.Util.uncompressStringBase64ToInt8BitArray(state.ob, out_buffer);
    };


    var bytes;
    var bankAddressOffset = 0;
    var baseBankSwitchAddress;
    var topBankSwitchAddress;
    var isPlus32;
    var extraRAMSize;
    var extraRAM;
   
    var out_buffer_write_pointer, out_buffer_send_pointer;
    var out_buffer = jt.Util.arrayFill(new Array(256), 0);

    var receive_buffer_write_pointer, receive_buffer_read_pointer;
    var receive_buffer = jt.Util.arrayFill(new Array(256), 0);
    
    var host, path, url;

    var ADDRESS_MASK = 0x0fff;
    var DEFAULT_TIMEOUT = 15000;
    var BANK_SIZE = 4096;


    if (rom) init(this);

};

jt.CartridgePLS.prototype = jt.Cartridge.base;

jt.CartridgePLS.recreateFromSaveState = function(state, prevCart) {
    var cart = prevCart || new jt.CartridgePLS();
    cart.loadState(state);
    return cart;
};

jt.CartridgePLS.isValidHostChar = function(cc) {
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
jt.CartridgePLS.isValidPathChar = function(cc) {
    return ((cc > 44 && cc < 58) || (cc > 64 && cc < 91) || (cc > 96 && cc < 122) );
};

jt.CartridgePLS.checkROM = function(rom) {
    var i = 0, host = "", path = "";
    while (jt.CartridgePLS.isValidPathChar(rom.content[i])){
        path +=  String.fromCharCode(rom.content[i++]);
    }
    if(rom.content[i] != 0){
        jt.Util.warning("Wrong delimiter in path!");
        return false;
    }
    
    i++;
    while (jt.CartridgePLS.isValidHostChar(rom.content[i])){
        host +=  String.fromCharCode(rom.content[i++]);
    }
    if(rom.content[i] != 0 || host.length < 3 || host.indexOf(".") == -1){ // we do not allow dotless hostnames or IP Adress strings. API on TLD not possible
        jt.Util.warning("Wrong delimiter, too short or dotless hostname!");
        return false;
    }
    
    return true;
};
