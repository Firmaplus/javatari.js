// Copyright 2015 by Paulo Augusto Peccin. See license.txt distributed with this file.

/**
 * Implements the simple bank switching method by masked address range access (within Cart area)
 * Supports SuperChip extra RAM (ON/OFF/AUTO).
 * Used by several n * 4K bank formats with varying extra RAM sizes
 */

jt.CartridgeBankedByMaskedRange = function(rom, format, pBaseBankSwitchAddress, superChip, pExtraRAMSize) {
"use strict";

    function init(self) {
        self.rom = rom;
        self.format = format;
        bytes = rom.content;        // uses the content of the ROM directly
        self.bytes = bytes;
        var numBanks = bytes.length / BANK_SIZE;
        baseBankSwitchAddress = pBaseBankSwitchAddress;
        topBankSwitchAddress = baseBankSwitchAddress + numBanks - 1;
        extraRAMSize = pExtraRAMSize;
        // SuperChip mode. null = automatic mode
        if (superChip == null || superChip == undefined) {
            superChipMode = false;
            superChipAutoDetect = true;
        } else {
            superChipMode = !!superChip;
            superChipAutoDetect = false;
        }
        extraRAM = superChip !== false ? jt.Util.arrayFill(new Array(extraRAMSize), 0) : null;

        hasPlusFunctions = jt.CartridgePlusFunctions.checkROM(rom);
        if(hasPlusFunctions){
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
          var pointerNMI = bytes.length - 5;
          var i = ((bytes[pointerNMI--] - 16) * 256 ) + bytes[pointerNMI];
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

    }

    this.read = function(address) {
        var maskedAddress = maskAddress(address);
        // Check for SuperChip Extra RAM reads
        if(hasPlusFunctions){
            if (maskedAddress == 0x0ff2){				   // Receive buffer
                var last_pos = receive_buffer_read_pointer;
                if(receive_buffer_read_pointer != receive_buffer_write_pointer){
                   if( ++receive_buffer_read_pointer > 255)
                        receive_buffer_read_pointer = 0;
                }
                return receive_buffer[last_pos];
            }else if (maskedAddress == 0x0ff3){		// Receive buffer length should always be >= 0
                if(receive_buffer_read_pointer > receive_buffer_write_pointer ){
                    return receive_buffer_write_pointer - receive_buffer_read_pointer + 255;
                }else{
                    return receive_buffer_write_pointer - receive_buffer_read_pointer;
                }
            }
        }
        if (superChipMode && (maskedAddress >= extraRAMSize) && (maskedAddress < extraRAMSize * 2))
            return extraRAM[maskedAddress - extraRAMSize];
        else
        // Always add the correct offset to access bank selected
            return bytes[bankAddressOffset + maskedAddress];
    };

    this.write = function(address, val) {
        var maskedAddress = maskAddress(address);
        if(hasPlusFunctions){
            if (maskedAddress == 0x0ff0 ){
                out_buffer[out_buffer_write_pointer++] = val;
                if (out_buffer_write_pointer > 255)
                    out_buffer_write_pointer = 0;
            }else if (maskedAddress == 0x0ff1 ){
                out_buffer[out_buffer_write_pointer++] = val;
    
                var req = new XMLHttpRequest();
                req.open("POST", url, true);
                req.setRequestHeader("PlusStore-ID", plusStoreID);
                req.setRequestHeader("Content-Type", "application/octet-stream");
                
                req.responseType = "arraybuffer";
                req.timeout = DEFAULT_TIMEOUT;
                req.onload = function () {
                    if (req.status === 200){
                      var raw_response = new Uint8Array(req.response);
                      var length  = raw_response[0];
                      var src_pos = 1;
                      while(!(src_pos > length)){
                        receive_buffer[receive_buffer_write_pointer++] = raw_response[src_pos++];
                        if(receive_buffer_write_pointer > 255)
                          receive_buffer_write_pointer = 0;
                      }
                    }else{
                      req.onerror();
                    }
                };
                req.onerror = req.ontimeout = function () {
                    console.log(" error 1 :" + req.status + " " + req.statusText);
                };
                
                var sendBinaryArray = new ArrayBuffer(out_buffer_write_pointer);
                var longInt8View = new Uint8Array(sendBinaryArray);
               
                for (var i = 0; out_buffer_write_pointer > i; i++){
                      longInt8View[i] = out_buffer[i];
               }
                req.send(sendBinaryArray);
    
                out_buffer_write_pointer = 0;
            }
        }
        // Check for Extra RAM writes and then turn superChip mode on
        if (maskedAddress < extraRAMSize && (superChipMode || superChipAutoDetect)) {
            if (!superChipMode) superChipMode = true;
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
            b: jt.Util.compressInt8BitArrayToStringBase64(bytes),
            bo: bankAddressOffset,
            bb: baseBankSwitchAddress,
            es: extraRAMSize,
            tb: topBankSwitchAddress,
            s: superChipMode | 0,
            sa: superChipAutoDetect | 0,
            e: extraRAM && jt.Util.compressInt8BitArrayToStringBase64(extraRAM),

            rb: jt.Util.compressInt8BitArrayToStringBase64(receive_buffer),
            ob: jt.Util.compressInt8BitArrayToStringBase64(out_buffer),
            h: host,
            p: path,
            pid: plusStoreID,
            u: url
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
        superChipMode = !!state.s;
        superChipAutoDetect = !!state.sa;
        extraRAM = state.e && jt.Util.uncompressStringBase64ToInt8BitArray(state.e, extraRAM);

        receive_buffer = jt.Util.uncompressStringBase64ToInt8BitArray(state.rb, receive_buffer);
        out_buffer = jt.Util.uncompressStringBase64ToInt8BitArray(state.ob, out_buffer);
        plusStoreID = state.pid;
        url = state.u;
    };


    var bytes;

    var bankAddressOffset = 0;
    var baseBankSwitchAddress;
    var topBankSwitchAddress;

    var superChipMode = false;
    var superChipAutoDetect;
    var extraRAMSize;
    var extraRAM;

    var hasPlusFunctions = false;
    var plusStoreID;
    var out_buffer_write_pointer, out_buffer_send_pointer;
    var out_buffer = jt.Util.arrayFill(new Array(256), 0);
    var receive_buffer_write_pointer, receive_buffer_read_pointer;
    var receive_buffer = jt.Util.arrayFill(new Array(256), 0);
    var host, path, url;
    var DEFAULT_TIMEOUT = 15000;

    var ADDRESS_MASK = 0x0fff;
    var BANK_SIZE = 4096;


    if (rom) init(this);

};

jt.CartridgeBankedByMaskedRange.prototype = jt.Cartridge.base;

jt.CartridgeBankedByMaskedRange.recreateFromSaveState = function(state, prevCart) {
    var cart = prevCart || new jt.CartridgeBankedByMaskedRange();
    cart.loadState(state);
    return cart;
};
