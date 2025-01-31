const { createApp } = Vue;
const { createVuetify } = Vuetify;

const vuetify = createVuetify({
    theme: {
        defaultTheme: 'light'
    }
});

const app = createApp({
    data() {
        return {
            activeTab: 'today',
            tasks: [],
            showTaskDialog: false,
            showSettings: false,
            editingTask: null,
            currentTask: {
                name: '',
                das: '',
                date: new Date().toISOString().split('T')[0],
                startTime: ''
            },
            settings: {
                dailyWorkHours: 8,
                dasInput: 'Administration\nDéveloppement\nFormation\nSupport',
                employeeName: 'Salarié',
                autoSaveEnabled: true,
                autoSaveInterval: 30 // minutes
            },
            dasList: [],
            timeEdit: {
                hours: '0',
                minutes: '0',
                seconds: '0'
            },
            lastCloseTime: null,
            instanceId: Date.now().toString(),
            activeInstances: new Set(),
            isFirstInstance: true,
            autoSaveTimer: null,
            pieChart: null,
            chartColors: [
                '#1976D2', '#E53935', '#43A047', '#FB8C00',
                '#8E24AA', '#00ACC1', '#3949AB', '#C0CA33',
                '#7B1FA2', '#00897B'
            ],
            statsPeriod: 'today',
            statsStartDate: new Date().toISOString().split('T')[0],
            statsEndDate: new Date().toISOString().split('T')[0],
            timerInterval: null,
            lastUpdateTime: null,
            notificationPermissionGranted: false,
        };
    },
    computed: {
        todayTasks() {
            const today = new Date().toISOString().split('T')[0];
            return this.tasks.filter(task => task.date === today) || [];
        },
        todayDasSummary() {
            const summary = {};
            if (this.todayTasks) {
                this.todayTasks.forEach(task => {
                    if (!summary[task.das]) {
                        summary[task.das] = 0;
                    }
                    summary[task.das] += task.elapsedTime;
                });
            }
            return summary;
        },
        todayTotalTime() {
            return this.todayTasks ? 
                Object.values(this.todayDasSummary).reduce((a, b) => a + b, 0) : 0;
        },
        overtimeHours() {
            const dailySeconds = this.settings.dailyWorkHours * 3600;
            return Math.max(0, this.todayTotalTime - dailySeconds);
        },
        groupedHistoricalTasks() {
            const grouped = {};
            if (this.tasks) {
                this.tasks.forEach(task => {
                    if (!grouped[task.date]) {
                        grouped[task.date] = [];
                    }
                    grouped[task.date].push(task);
                });
            }
            return Object.fromEntries(
                Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0]))
            );
        },
        maxDate() {
            return new Date().toISOString().split('T')[0];
        },
        dasStats() {
            const stats = {};
            this.tasks.forEach(task => {
                if (!stats[task.das]) {
                    stats[task.das] = 0;
                }
                stats[task.das] += task.elapsedTime;
            });
            return stats;
        },
        totalStatsTime() {
            return Object.values(this.dasStats).reduce((a, b) => a + b, 0);
        },
        filteredTasks() {
            const today = new Date();
            const startOfWeek = new Date(today);
            startOfWeek.setDate(today.getDate() - today.getDay());
            const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
            const startOfSixMonths = new Date(today);
            startOfSixMonths.setMonth(today.getMonth() - 6);

            return this.tasks.filter(task => {
                const taskDate = new Date(task.date);
                switch (this.statsPeriod) {
                    case 'today':
                        return task.date === today.toISOString().split('T')[0];
                    case 'week':
                        return taskDate >= startOfWeek && taskDate <= today;
                    case 'month':
                        return taskDate >= startOfMonth && taskDate <= today;
                    case 'sixMonths':
                        return taskDate >= startOfSixMonths && taskDate <= today;
                    case 'custom':
                        return task.date >= this.statsStartDate && task.date <= this.statsEndDate;
                    case 'all':
                    default:
                        return true;
                }
            });
        },
        filteredDasStats() {
            const stats = {};
            this.filteredTasks.forEach(task => {
                if (!stats[task.das]) {
                    stats[task.das] = 0;
                }
                stats[task.das] += task.elapsedTime;
            });
            return stats;
        },
        filteredTotalTime() {
            return Object.values(this.filteredDasStats).reduce((a, b) => a + b, 0);
        },
        filteredWorkDays() {
            const uniqueDays = new Set(this.filteredTasks.map(task => task.date));
            return uniqueDays.size;
        },
        filteredOvertimeHours() {
            const expectedWorkTime = this.filteredWorkDays * this.settings.dailyWorkHours * 3600;
            return this.filteredTotalTime - expectedWorkTime;
        },
        topTasks() {
            return [...this.filteredTasks]
                .sort((a, b) => b.elapsedTime - a.elapsedTime)
                .slice(0, 3);
        },
        formatPeriodRange() {
            const today = new Date();
            let start, end;

            switch (this.statsPeriod) {
                case 'today':
                    return this.formatDate(today.toISOString().split('T')[0]);
                case 'week':
                    start = new Date(today);
                    start.setDate(today.getDate() - today.getDay());
                    return `Du ${this.formatDate(start.toISOString().split('T')[0])} au ${this.formatDate(today.toISOString().split('T')[0])}`;
                case 'month':
                    start = new Date(today.getFullYear(), today.getMonth(), 1);
                    end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                    return `Du ${this.formatDate(start.toISOString().split('T')[0])} au ${this.formatDate(end.toISOString().split('T')[0])}`;
                case 'sixMonths':
                    start = new Date(today);
                    start.setMonth(today.getMonth() - 6);
                    return `Du ${this.formatDate(start.toISOString().split('T')[0])} au ${this.formatDate(today.toISOString().split('T')[0])}`;
                case 'custom':
                    if (this.statsStartDate && this.statsEndDate) {
                        return `Du ${this.formatDate(this.statsStartDate)} au ${this.formatDate(this.statsEndDate)}`;
                    }
                    return '';
                case 'all':
                    if (this.tasks.length > 0) {
                        const dates = this.tasks.map(t => t.date);
                        start = new Date(Math.min(...dates.map(d => new Date(d))));
                        end = new Date(Math.max(...dates.map(d => new Date(d))));
                        return `Du ${this.formatDate(start.toISOString().split('T')[0])} au ${this.formatDate(end.toISOString().split('T')[0])}`;
                    }
                    return 'Toute la période';
            }
        }
    },
    methods: {
        formatTime(seconds) {
            if (typeof seconds !== 'number') return '00:00:00';
            const isNegative = seconds < 0;
            seconds = Math.abs(seconds);
            const h = Math.floor(seconds / 3600);
            const m = Math.floor((seconds % 3600) / 60);
            const s = seconds % 60;
            const time = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
            return isNegative ? `- ${time}` : time;
        },
        formatDate(dateStr) {
            return new Date(dateStr).toLocaleDateString('fr-FR', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        },
        getDayTotal(dayTasks) {
            return dayTasks ? dayTasks.reduce((total, task) => total + task.elapsedTime, 0) : 0;
        },
        editTask(task) {
            if (!task) return;
            this.editingTask = task;
            this.currentTask = { 
                name: task.name,
                das: task.das,
                date: task.date,
                startTime: task.startHour ? new Date(task.startHour).toLocaleTimeString('fr-FR', {
                    hour: '2-digit',
                    minute: '2-digit'
                }) : ''
            };
            
            const h = Math.floor(task.elapsedTime / 3600);
            const m = Math.floor((task.elapsedTime % 3600) / 60);
            const s = task.elapsedTime % 60;
            
            this.timeEdit = {
                hours: h.toString(),
                minutes: m.toString(),
                seconds: s.toString()
            };
            
            this.showTaskDialog = true;
        },
        validateTimeInput() {
            this.timeEdit.hours = Math.max(0, parseInt(this.timeEdit.hours) || 0).toString();
            this.timeEdit.minutes = Math.min(59, Math.max(0, parseInt(this.timeEdit.minutes) || 0)).toString();
            this.timeEdit.seconds = Math.min(59, Math.max(0, parseInt(this.timeEdit.seconds) || 0)).toString();
        },
        saveTask() {
            if (!this.currentTask.name || !this.currentTask.das) return;
            
            if (this.editingTask) {
                const totalSeconds = 
                    parseInt(this.timeEdit.hours) * 3600 +
                    parseInt(this.timeEdit.minutes) * 60 +
                    parseInt(this.timeEdit.seconds);
                
                let startHour = null;
                if (this.currentTask.startTime) {
                    const [hours, minutes] = this.currentTask.startTime.split(':');
                    const date = new Date(this.currentTask.date);
                    date.setHours(parseInt(hours), parseInt(minutes), 0);
                    startHour = date.toISOString();
                }
                
                Object.assign(this.editingTask, {
                    name: this.currentTask.name,
                    das: this.currentTask.das,
                    elapsedTime: totalSeconds,
                    initialElapsedTime: totalSeconds,
                    date: this.currentTask.date,
                    startHour: startHour
                });
            } else {
                this.tasks.push({
                    id: Date.now(),
                    date: new Date().toISOString().split('T')[0],
                    name: this.currentTask.name,
                    das: this.currentTask.das,
                    elapsedTime: 0,
                    initialElapsedTime: 0,
                    isRunning: false,
                    startTime: null,
                    startHour: null
                });
            }
            
            this.showTaskDialog = false;
            this.editingTask = null;
            this.currentTask = { name: '', das: '', date: new Date().toISOString().split('T')[0], startTime: '' };
            this.timeEdit = { hours: '0', minutes: '0', seconds: '0' };
            this.autoSaveData();
        },
        async requestNotificationPermission() {
            try {
                const permission = await Notification.requestPermission();
                this.notificationPermissionGranted = permission === 'granted';
            } catch (error) {
                console.error('Erreur lors de la demande de permission pour les notifications:', error);
            }
        },
        toggleTimer(task) {
            if (!task) return;

            // Demander la permission pour les notifications lors du premier démarrage d'une tâche
            if (!this.notificationPermissionGranted && Notification.permission === 'default') {
                this.requestNotificationPermission();
            }

            // Arrêter le timer existant s'il y en a un
            if (this.timerInterval) {
                clearInterval(this.timerInterval);
                this.timerInterval = null;
            }

            if (!task.isRunning) {
                if (!task.startHour) {
                    task.startHour = new Date().toISOString();
                }
                // Arrêter les autres tâches en cours
                this.tasks.forEach(t => {
                    if (t.isRunning && t.id !== task.id) {
                        t.isRunning = false;
                        t.startTime = null;
                    }
                });
                
                task.isRunning = true;
                task.startTime = Date.now();
                this.startTimer(task);
            } else {
                task.isRunning = false;
                task.startTime = null;
            }
            
            this.saveTasks();
            localStorage.removeItem('lastCloseTime');
        },
        startTimer(task) {
            if (!task || !task.isRunning) return;
            
            // Arrêter le timer existant s'il y en a un
            if (this.timerInterval) {
                clearInterval(this.timerInterval);
            }
            
            // S'assurer que le startTime est défini
            if (!task.startTime) {
                task.startTime = Date.now();
            }
            
            this.lastUpdateTime = Date.now();
            
            // Créer un nouveau timer qui s'exécute chaque seconde
            this.timerInterval = setInterval(() => {
                if (!task.isRunning) {
                    clearInterval(this.timerInterval);
                    return;
                }
                
                const now = Date.now();
                const elapsed = Math.floor((now - this.lastUpdateTime) / 1000);
                
                if (elapsed > 0) {
                    task.elapsedTime += elapsed;
                    this.lastUpdateTime = now;
                    this.saveTasks();
                    
                    // Sauvegarder l'état actuel dans le localStorage
                    localStorage.setItem('currentRunningTask', JSON.stringify({
                        taskId: task.id,
                        startTime: task.startTime,
                        lastUpdateTime: this.lastUpdateTime
                    }));
                }
            }, 1000);
        },
        saveSettings() {
            this.dasList = this.settings.dasInput.split('\n').filter(das => das.trim());
            localStorage.setItem('timeTrackerSettings', JSON.stringify(this.settings));
            this.startAutoSave();
            this.showSettings = false;
        },
        loadSettings() {
            const savedSettings = localStorage.getItem('timeTrackerSettings');
            if (savedSettings) {
                this.settings = JSON.parse(savedSettings);
            }
            this.dasList = this.settings.dasInput.split('\n').filter(das => das.trim());
        },
        async saveTasks() {
            localStorage.setItem('timeTrackerTasks', JSON.stringify(this.tasks));
        },
        loadTasks() {
            const savedTasks = localStorage.getItem('timeTrackerTasks');
            if (savedTasks) {
                try {
                    this.tasks = JSON.parse(savedTasks);
                    
                    // Restaurer l'état des tâches en cours
                    this.tasks.forEach(task => {
                        if (task.isRunning) {
                            // Réinitialiser le startTime pour les tâches en cours
                            task.startTime = Date.now();
                            // Démarrer le timer
                            this.$nextTick(() => {
                                this.startTimer(task);
                            });
                        }
                    });

                    const lastCloseTime = localStorage.getItem('lastCloseTime');
                    if (lastCloseTime) {
                        const closeTime = new Date(lastCloseTime);
                        const now = new Date();
                        
                        this.tasks.forEach(task => {
                            if (task.isRunning) {
                                const elapsedSeconds = Math.floor((now - closeTime) / 1000);
                                if (elapsedSeconds > 0) {
                                    task.elapsedTime += elapsedSeconds;
                                    task.startTime = Date.now();
                                    
                                    // Notification si plus d'une minute s'est écoulée
                                    const minutes = Math.floor(elapsedSeconds / 60);
                                    if (minutes > 0 && Notification.permission === 'granted') {
                                        new Notification('Temps ajouté', {
                                            body: `${minutes} minute(s) ajoutée(s) à la tâche "${task.name}"`,
                                            icon: './favicon.ico',
                                            tag: 'time-added-' + task.id,
                                            requireInteraction: true
                                        });
                                    }
                                }
                            }
                        });
                        
                        localStorage.removeItem('lastCloseTime');
                    }
                } catch (error) {
                    console.error('Erreur lors du chargement des tâches:', error);
                }
            }
        },
        deleteTask() {
            if (!this.editingTask) return;
            
            const index = this.tasks.findIndex(t => t.id === this.editingTask.id);
            if (index !== -1) {
                this.tasks.splice(index, 1);
                this.saveTasks();
            }
            
            this.showTaskDialog = false;
            this.editingTask = null;
            this.currentTask = { name: '', das: '', date: new Date().toISOString().split('T')[0], startTime: '' };
            this.timeEdit = { hours: '0', minutes: '0', seconds: '0' };
        },
        formatStartTime(isoString) {
            const date = new Date(isoString);
            return date.toLocaleTimeString('fr-FR', {
                hour: '2-digit',
                minute: '2-digit'
            });
        },
        exportExcel() {
            console.log('Début export Excel');
            try {
                const workbook = this.createWorkbook();
                XLSX.writeFile(workbook, `export_heures_${new Date().toISOString().split('T')[0]}.xlsx`, {
                    bookType: 'xlsx',
                    bookSST: false,
                    type: 'binary',
                    cellStyles: true
                });
                console.log('Export Excel terminé');
            } catch (error) {
                console.error('Erreur lors de l\'export Excel:', error);
            }
        },
        createWorkbook() {
            const workbook = XLSX.utils.book_new();
            
            // Obtenir l'année en cours
            const currentYear = new Date().getFullYear();

            // Créer une feuille pour chaque mois de l'année en cours
            for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
                const firstDay = new Date(currentYear, monthIndex, 1);
                const lastDay = new Date(currentYear, monthIndex + 1, 0);
                const dates = [];
                
                for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
                    dates.push(new Date(d));
                }

                const monthKey = `${currentYear}-${(monthIndex + 1).toString().padStart(2, '0')}`;
                const monthTasks = this.tasks.filter(task => {
                    const taskDate = new Date(task.date);
                    return taskDate.getFullYear() === currentYear && taskDate.getMonth() === monthIndex;
                });

                const data = [];
                const monthName = firstDay.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

                // Titre avec style
                data.push(['Export des heures - ' + monthName + ' - ' + this.settings.employeeName]);
                data.push([]);

                // En-têtes des dates avec jours de la semaine
                const headerRow = ['DAS'];
                dates.forEach(date => {
                    const dayName = date.toLocaleDateString('fr-FR', { weekday: 'short' });
                    const dayMonth = date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
                    headerRow.push(`${dayName}. ${dayMonth}`);
                });
                data.push(headerRow);

                // Données par DAS
                const uniqueDAS = [...new Set(this.tasks.map(t => t.das))];
                uniqueDAS.forEach(das => {
                    const row = [das];
                    dates.forEach(date => {
                        const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                        const isHolidayDate = this.isHoliday(date);
                        
                        if (isWeekend || isHolidayDate) {
                            row.push('');
                        } else {
                            const dateStr = date.toISOString().split('T')[0];
                            const tasksForDate = monthTasks.filter(t => t.date === dateStr && t.das === das);
                            const total = tasksForDate.reduce((sum, t) => sum + t.elapsedTime, 0);
                            row.push(total > 0 ? this.formatTime(total) : '');
                        }
                    });
                    data.push(row);
                });

                // Ligne noire pour le total
                data.push([]);
                const totalRow = ['Total'];
                dates.forEach(date => {
                    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                    const isHolidayDate = this.isHoliday(date);
                    
                    if (isWeekend || isHolidayDate) {
                        totalRow.push('');
                    } else {
                        const dateStr = date.toISOString().split('T')[0];
                        const total = monthTasks
                            .filter(t => t.date === dateStr)
                            .reduce((sum, t) => sum + t.elapsedTime, 0);
                        totalRow.push(total > 0 ? this.formatTime(total) : '');
                    }
                });
                data.push(totalRow);

                // Heures supplémentaires
                const diffRow = ['Heures supp'];
                dates.forEach(date => {
                    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                    const isHolidayDate = this.isHoliday(date);
                    
                    if (isWeekend || isHolidayDate) {
                        diffRow.push('00:00:00');
                    } else {
                        const dateStr = date.toISOString().split('T')[0];
                        const total = monthTasks
                            .filter(t => t.date === dateStr)
                            .reduce((sum, t) => sum + t.elapsedTime, 0);
                        const diff = total - (this.settings.dailyWorkHours * 3600);
                        diffRow.push(diff !== 0 ? this.formatTime(diff) : '');
                    }
                });
                data.push(diffRow);

                // Ajouter deux lignes vides pour la séparation
                data.push([]);
                data.push([]);

                // Totaux mensuels
                data.push(['Totaux du mois']);

                // Total des heures supplémentaires du mois
                let totalMonthOvertime = 0;
                dates.forEach(date => {
                    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                    const isHolidayDate = this.isHoliday(date);
                    
                    if (!isWeekend && !isHolidayDate) {
                        const dateStr = date.toISOString().split('T')[0];
                        const total = monthTasks
                            .filter(t => t.date === dateStr)
                            .reduce((sum, t) => sum + t.elapsedTime, 0);
                        const diff = total - (this.settings.dailyWorkHours * 3600);
                        if (diff > 0) totalMonthOvertime += diff;
                    }
                });
                data.push(['Total heures supplémentaires', this.formatTime(totalMonthOvertime)]);

                // Total par DAS
                uniqueDAS.forEach(das => {
                    const totalDas = dates.reduce((sum, date) => {
                        const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                        const isHolidayDate = this.isHoliday(date);
                        
                        if (!isWeekend && !isHolidayDate) {
                            const dateStr = date.toISOString().split('T')[0];
                            const tasksForDate = monthTasks.filter(t => t.date === dateStr && t.das === das);
                            return sum + tasksForDate.reduce((s, t) => s + t.elapsedTime, 0);
                        }
                        return sum;
                    }, 0);
                    data.push([`Total ${das}`, this.formatTime(totalDas)]);
                });

                // Créer la feuille
                const ws = XLSX.utils.aoa_to_sheet(data);

                // Appliquer les styles
                const range = XLSX.utils.decode_range(ws['!ref']);
                for (let R = range.s.r; R <= range.e.r; R++) {
                    for (let C = range.s.c; C <= range.e.c; C++) {
                        const cellRef = XLSX.utils.encode_cell({r: R, c: C});
                        if (!ws[cellRef]) ws[cellRef] = { v: '', s: {} };
                        
                        // Style de base pour toutes les cellules
                        ws[cellRef].s = {
                            alignment: {
                                horizontal: 'center',
                                vertical: 'center'
                            }
                        };

                        // Vérifier si la ligne existe dans data
                        const currentRow = data[R];
                        if (!currentRow) continue;

                        const firstCellInRow = currentRow[0] || '';

                        // Style pour le titre (ligne 1)
                        if (R === 0) {
                            ws[cellRef].s = {
                                ...ws[cellRef].s,
                                font: {
                                    bold: true,
                                    sz: 15
                                },
                                alignment: {
                                    horizontal: 'left',
                                    vertical: 'center'
                                }
                            };
                        }

                        // Style pour la ligne DAS (ligne 3)
                        if (R === 2) {
                            ws[cellRef].s = {
                                ...ws[cellRef].s,
                                font: {
                                    bold: true,
                                    color: { rgb: '000000' }
                                },
                                fill: {
                                    type: 'pattern',
                                    patternType: 'solid',
                                    fgColor: { rgb: '90EE90' } // Vert clair
                                }
                            };
                        }

                        // Ligne noire sur la ligne Total
                        if (firstCellInRow === 'Total') {
                            ws[cellRef].s = {
                                ...ws[cellRef].s,
                                fill: {
                                    type: 'pattern',
                                    patternType: 'solid',
                                    fgColor: { rgb: '000000' }
                                },
                                font: { 
                                    bold: true,
                                    color: { rgb: 'FFFFFF' }  // Texte en blanc pour la visibilité
                                }
                            };
                        }

                        // Bordures pour le tableau calendrier (de DAS à Heures supp)
                        if ((R >= 2 && firstCellInRow === 'DAS') || 
                            (R > 2 && R <= data.findIndex(row => row[0] === 'Heures supp'))) {
                            ws[cellRef].s = {
                                ...ws[cellRef].s,
                                border: {
                                    top: { style: 'thin', color: { rgb: '000000' } },
                                    bottom: { style: 'thin', color: { rgb: '000000' } },
                                    left: { style: 'thin', color: { rgb: '000000' } },
                                    right: { style: 'thin', color: { rgb: '000000' } }
                                }
                            };
                        }

                        // Style pour les lignes DAS (fond bleu clair)
                        if (R >= 3 && R < data.findIndex(row => row[0] === 'Total') && 
                            firstCellInRow && 
                            !firstCellInRow.startsWith('Total') && 
                            firstCellInRow !== 'Heures supp') {
                            ws[cellRef].s = {
                                ...ws[cellRef].s,
                                fill: {
                                    type: 'pattern',
                                    patternType: 'solid',
                                    fgColor: { rgb: 'E3F2FD' }
                                }
                            };
                        }

                        // Style pour la ligne Heures supp (en gras)
                        if (firstCellInRow === 'Heures supp') {
                            ws[cellRef].s = {
                                ...ws[cellRef].s,
                                font: { bold: true }
                            };
                        }

                        // Style pour les totaux mensuels
                        if (R >= data.length - uniqueDAS.length - 2) {
                            ws[cellRef].s = {
                                ...ws[cellRef].s,
                                font: { bold: true }
                            };
                            if (C === 0) {
                                ws[cellRef].s.alignment.horizontal = 'left';
                            }
                        }
                    }
                }

                // Griser les weekends et jours fériés
                dates.forEach((date, index) => {
                    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                    const isHolidayDate = this.isHoliday(date);
                    
                    if (isWeekend || isHolidayDate) {
                        const col = index + 1;
                        // Griser toute la colonne jusqu'aux heures supplémentaires
                        for (let row = 3; row <= data.findIndex(row => row[0] === 'Heures supp'); row++) {
                            const cellRef = XLSX.utils.encode_cell({r: row, c: col});
                            if (!ws[cellRef]) ws[cellRef] = { v: '', s: {} };
                            
                            // Ne pas écraser le style de la ligne Total
                            const currentRow = data[row];
                            const firstCellInRow = currentRow ? currentRow[0] || '' : '';
                            
                            if (firstCellInRow === 'Total') {
                                ws[cellRef].s = {
                                    ...ws[cellRef].s,
                                    fill: {
                                        type: 'pattern',
                                        patternType: 'solid',
                                        fgColor: { rgb: '000000' }
                                    },
                                    font: { 
                                        bold: true,
                                        color: { rgb: 'FFFFFF' }
                                    },
                                    border: {
                                        top: { style: 'thin', color: { rgb: '000000' } },
                                        bottom: { style: 'thin', color: { rgb: '000000' } },
                                        left: { style: 'thin', color: { rgb: '000000' } },
                                        right: { style: 'thin', color: { rgb: '000000' } }
                                    }
                                };
                            } else {
                                ws[cellRef].s = {
                                    ...ws[cellRef].s,
                                    fill: {
                                        type: 'pattern',
                                        patternType: 'solid',
                                        fgColor: { rgb: 'F5F5F5' }
                                    },
                                    border: {
                                        top: { style: 'thin', color: { rgb: '000000' } },
                                        bottom: { style: 'thin', color: { rgb: '000000' } },
                                        left: { style: 'thin', color: { rgb: '000000' } },
                                        right: { style: 'thin', color: { rgb: '000000' } }
                                    }
                                };
                            }
                        }
                    }
                });

                // Définir les largeurs de colonnes
                ws['!cols'] = [{ wch: 15 }];
                dates.forEach(() => {
                    ws['!cols'].push({ wch: 12 }); // Augmenté pour accommoder le format "mer. 16/02"
                });

                // Ajouter la feuille au classeur
                XLSX.utils.book_append_sheet(workbook, ws, monthName);
            }

            return workbook;
        },
        exportCSV() {
            console.log('Début export CSV');
            try {
                // Créer l'en-tête
                const headers = ['Date', 'DAS', 'Tâche', 'Temps'];
                let csvContent = headers.join(',') + '\n';

                // Trier les tâches par date
                const sortedTasks = [...this.tasks].sort((a, b) => a.date.localeCompare(b.date));

                // Ajouter chaque tâche
                sortedTasks.forEach(task => {
                    const row = [
                        task.date,
                        task.das,
                        `"${task.name}"`,
                        this.formatTime(task.elapsedTime)
                    ];
                    csvContent += row.join(',') + '\n';
                });

                // Créer et télécharger le fichier
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = `export_heures_${new Date().toISOString().split('T')[0]}.csv`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                console.log('Export CSV terminé');
            } catch (error) {
                console.error('Erreur lors de l\'export CSV:', error);
            }
        },
        exportICAL() {
            console.log('Début export ICAL');
            try {
                // Créer le contenu du fichier iCal
                let icalContent = [
                    'BEGIN:VCALENDAR',
                    'VERSION:2.0',
                    'PRODID:-//Compteur de Temps//FR',
                    'CALSCALE:GREGORIAN'
                ];

                // Créer un événement pour chaque tâche
                this.tasks.forEach(task => {
                    // Définir les heures de début et de fin
                    let startTime = new Date(task.date);
                    let endTime = new Date(task.date);

                    // Si on a une heure de début pour la tâche, on l'utilise
                    if (task.startHour) {
                        startTime = new Date(task.startHour);
                    } else {
                        // Par défaut, on commence à 9h
                        startTime.setHours(9, 0, 0);
                    }

                    // Calculer l'heure de fin en ajoutant le temps de la tâche
                    endTime = new Date(startTime.getTime() + (task.elapsedTime * 1000));

                    // Formater les dates pour iCal
                    const formatDateTime = (date) => {
                        return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
                    };

                    // Créer la description détaillée
                    const description = `Temps passé: ${this.formatTime(task.elapsedTime)}`;

                    // Créer l'événement
                    icalContent = icalContent.concat([
                        'BEGIN:VEVENT',
                        `DTSTART:${formatDateTime(startTime)}`,
                        `DTEND:${formatDateTime(endTime)}`,
                        `SUMMARY:${task.das} - ${task.name}`,
                        `DESCRIPTION:${description}`,
                        'X-ALT-DESC;FMTTYPE=text/html:' + description.replace(/\\n/g, '<br>'),
                        `UID:${task.id}-${task.date}-timetracker@local`,
                        'END:VEVENT'
                    ]);
                });

                icalContent.push('END:VCALENDAR');

                // Créer et télécharger le fichier
                const blob = new Blob([icalContent.join('\r\n')], { type: 'text/calendar' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `export_heures_${new Date().toISOString().split('T')[0]}.ics`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                console.log('Export ICAL terminé');
            } catch (error) {
                console.error('Erreur lors de l\'export ICAL:', error);
            }
        },
        isHoliday(date) {
            // ... (le reste du code de la méthode isHoliday)
        },
        beforeUnload() {
            const runningTasks = this.tasks.filter(t => t.isRunning);
            if (runningTasks.length > 0) {
                localStorage.setItem('lastCloseTime', new Date().toISOString());
                this.saveTasks();
            }
            
            // Supprimer cette instance de la liste des instances actives
            const instances = JSON.parse(localStorage.getItem('activeInstances') || '[]');
            const updatedInstances = instances.filter(i => i.id !== this.instanceId);
            localStorage.setItem('activeInstances', JSON.stringify(updatedInstances));
        },
        handleReopen() {
            const lastCloseTime = localStorage.getItem('lastCloseTime');
            if (lastCloseTime) {
                const closeTime = new Date(lastCloseTime);
                const now = new Date();
                const runningTasks = this.tasks.filter(t => t.isRunning);
                
                runningTasks.forEach(task => {
                    const elapsedSeconds = Math.floor((now - closeTime) / 1000);
                    if (elapsedSeconds > 0) {
                        task.elapsedTime += elapsedSeconds;
                        task.startTime = Date.now();
                        
                        // Redémarrer le timer
                        this.startTimer(task);
                        
                        // Envoyer une notification si plus d'une minute s'est écoulée
                        const minutes = Math.floor(elapsedSeconds / 60);
                        if (minutes > 0) {
                            this.showNotification('Temps ajouté', 
                                `${minutes} minute(s) ajoutée(s) à la tâche "${task.name}"`,
                                { tag: 'time-added-' + task.id }
                            );
                        }
                    }
                });

                if (runningTasks.length > 0) {
                    this.saveTasks();
                }

                localStorage.removeItem('lastCloseTime');
            }
        },
        checkActiveInstance() {
            const now = Date.now();
            let instances = JSON.parse(localStorage.getItem('activeInstances') || '[]');
            
            // Nettoyer les instances inactives (plus de 5 secondes sans ping)
            instances = instances.filter(instance => {
                return (now - instance.lastPing) <= 5000;
            });

            // Mettre à jour ou ajouter l'instance actuelle
            const currentInstance = instances.find(i => i.id === this.instanceId);
            if (!currentInstance) {
                instances.push({
                    id: this.instanceId,
                    lastPing: now
                });
            } else {
                currentInstance.lastPing = now;
            }

            // Trier les instances par ID (qui est basé sur timestamp) pour identifier la plus ancienne
            instances.sort((a, b) => parseInt(a.id) - parseInt(b.id));
            
            // L'instance est la première si son ID correspond à la plus ancienne instance
            this.isFirstInstance = instances[0].id === this.instanceId;
            
            localStorage.setItem('activeInstances', JSON.stringify(instances));
            this.activeInstances = new Set(instances.map(i => i.id));
            
            return this.isFirstInstance;
        },
        setAsActiveInstance() {
            this.updatePing();
        },
        updatePing() {
            this.checkActiveInstance();
        },
        startInstanceCheck() {
            // Vérifier les instances actives toutes les 2 secondes
            setInterval(() => {
                this.checkActiveInstance();
            }, 2000);

            // Écouter les changements dans le localStorage
            window.addEventListener('storage', (e) => {
                if (e.key === 'activeInstances') {
                    this.checkActiveInstance();
                } else if (e.key === 'timeTrackerTasks') {
                    // Recharger les tâches si elles ont été modifiées par une autre instance
                    const newTasks = JSON.parse(e.newValue);
                    if (newTasks) {
                        this.tasks = newTasks;
                        // Redémarrer les timers si nécessaire
                        this.tasks.forEach(task => {
                            if (task.isRunning) {
                                this.startTimer(task);
                            }
                        });
                    }
                }
            });
        },
        async autoSaveData() {
            try {
                const data = {
                    tasks: this.tasks,
                    settings: this.settings,
                    version: '1.0'
                };

                // Sauvegarde dans localStorage
                localStorage.setItem('timeTrackerData', JSON.stringify(data));
                console.log('✅ Données sauvegardées:', new Date().toLocaleString());
            } catch (error) {
                console.error('❌ Erreur lors de la sauvegarde:', error);
            }
        },
        loadData() {
            try {
                const savedData = localStorage.getItem('timeTrackerData');
                if (savedData) {
                    const data = JSON.parse(savedData);
                    if (data.version && data.tasks && data.settings) {
                        this.tasks = data.tasks;
                        this.settings = data.settings;
                        this.dasList = this.settings.dasInput.split('\n').filter(das => das.trim());
                    }
                }
            } catch (error) {
                console.error('Erreur lors du chargement des données:', error);
            }
        },
        startAutoSave() {
            if (this.autoSaveTimer) {
                clearInterval(this.autoSaveTimer);
            }
            
            if (this.settings.autoSaveEnabled) {
                this.autoSaveTimer = setInterval(() => {
                    if (this.checkActiveInstance()) {
                        this.autoSaveData();
                    }
                }, this.settings.autoSaveInterval * 60 * 1000);
            }
        },
        exportToJson() {
            try {
                const data = {
                    tasks: this.tasks,
                    settings: this.settings,
                    version: '1.0'
                };

                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `compteur_temps_backup_${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                console.log('✅ Fichier JSON exporté');
            } catch (error) {
                console.error('❌ Erreur lors de l\'export:', error);
                alert('Erreur lors de l\'export des données');
            }
        },
        importFromJson(event) {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    
                    // Vérifier la structure des données
                    if (!data.version || !data.tasks || !data.settings) {
                        throw new Error('Format de fichier invalide');
                    }

                    // Importer les données
                    this.tasks = data.tasks;
                    this.settings = data.settings;
                    this.dasList = this.settings.dasInput.split('\n').filter(das => das.trim());
                    
                    // Sauvegarder dans le localStorage
                    this.autoSaveData();
                    
                    console.log('✅ Données importées avec succès');
                    alert('Import réussi !');
                } catch (error) {
                    console.error('❌ Erreur lors de l\'import:', error);
                    alert('Erreur : le fichier sélectionné n\'est pas valide');
                }
            };
            reader.readAsText(file);
            
            // Réinitialiser l'input file
            event.target.value = '';
        },
        getChartColor(das) {
            const index = this.dasList.indexOf(das) % this.chartColors.length;
            return this.chartColors[index];
        },
        updatePieChart() {
            if (this.pieChart) {
                this.pieChart.destroy();
            }

            const ctx = this.$refs.pieChart?.getContext('2d');
            if (!ctx) return;

            const data = {
                labels: Object.keys(this.filteredDasStats),
                datasets: [{
                    data: Object.values(this.filteredDasStats),
                    backgroundColor: Object.keys(this.filteredDasStats).map(das => this.getChartColor(das))
                }]
            };

            this.pieChart = new Chart(ctx, {
                type: 'pie',
                data: data,
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            display: true,
                            labels: {
                                font: {
                                    size: 12
                                },
                                padding: 10,
                                usePointStyle: true,
                                pointStyle: 'circle'
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: (context) => {
                                    const value = context.raw;
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const percentage = Math.round((value / total) * 100);
                                    return `${context.label}: ${this.formatTime(value)} (${percentage}%)`;
                                }
                            }
                        }
                    }
                }
            });
        },
        showNotification(title, body, options = {}) {
            if (this.notificationPermissionGranted) {
                new Notification(title, {
                    body,
                    icon: './favicon.ico',
                    requireInteraction: true,
                    ...options
                });
            }
        },
    },
    watch: {
        activeTab(newVal) {
            if (newVal === 'stats') {
                this.$nextTick(() => {
                    this.updatePieChart();
                });
            }
        },
        tasks: {
            deep: true,
            handler() {
                if (this.activeTab === 'stats') {
                    this.updatePieChart();
                }
            }
        },
        statsPeriod: {
            immediate: true,
            handler() {
                if (this.activeTab === 'stats') {
                    this.$nextTick(() => {
                        this.updatePieChart();
                    });
                }
            }
        },
        filteredDasStats: {
            deep: true,
            handler() {
                if (this.activeTab === 'stats') {
                    this.$nextTick(() => {
                        this.updatePieChart();
                    });
                }
            }
        }
    },
    mounted() {
        // Vérifier si la permission est déjà accordée
        this.notificationPermissionGranted = Notification.permission === 'granted';

        // Charger les données dans le bon ordre
        this.loadSettings();
        this.loadData();
        this.loadTasks();

        // Vérifier s'il y avait une tâche en cours
        const currentRunningTask = localStorage.getItem('currentRunningTask');
        if (currentRunningTask) {
            try {
                const { taskId, startTime, lastUpdateTime } = JSON.parse(currentRunningTask);
                const task = this.tasks.find(t => t.id === taskId);
                if (task && task.isRunning) {
                    task.startTime = startTime;
                    this.lastUpdateTime = lastUpdateTime;
                    this.$nextTick(() => {
                        this.startTimer(task);
                    });
                }
            } catch (error) {
                console.error('Erreur lors de la restauration de la tâche en cours:', error);
            }
        }

        // Gestionnaires d'événements
        window.addEventListener('beforeunload', () => {
            this.beforeUnload();
        });
        
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                const runningTasks = this.tasks.filter(t => t.isRunning);
                if (runningTasks.length > 0) {
                    this.beforeUnload();
                }
            } else {
                this.checkActiveInstance();
                this.handleReopen();
            }
        });

        // Démarrer les vérifications d'instance et la sauvegarde automatique
        this.startInstanceCheck();
        this.startAutoSave();
    },
    beforeDestroy() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }
        // Nettoyer les données temporaires
        localStorage.removeItem('currentRunningTask');
    },
});

app.use(vuetify);
app.mount('#app'); 