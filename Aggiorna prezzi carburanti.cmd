@echo off
title SpesaSmart - prezzi carburanti
rem Scarica i prezzi MIMIT del giorno (dal PC, connessione italiana) e li carica su GitHub:
rem l'app pubblicata si aggiorna da sola in pochi minuti. I dati nuovi escono verso le 9.
node "%~dp0scripts\pubblica-carburanti.mjs"
if "%~1"=="" pause
