$(document).ready(function() {

	/********** Initialize **********/
	$('div.overlay').show();
	const initialize = init(_addDefaultState = function(newData) {
		return {page: {loadInstance: 0}};
	}, true).done((userData) => updateUi(userData));
	
	
	/********** Attach Button Event Listener to New Budget **********/
	$('#add-budget-open').on('click', function(event) {
		const modal = $('#add-budget-modal');		
		modal.modal('show');
	});

	/********** Attach Event Listener to New Budget - "Include in Budget" & "Auto-Calculate" **********/
	$('#add-budget-table').on('click', 'input.add-budget-include:enabled', function(event) {
		const dt = $('#add-budget-table').DataTable();
		const thisRow = dt.row($(this).closest('tr'));
		const thisRowData = thisRow.data();
		let newRowData = thisRowData;
		newRowData['includeInBudget'] = $(this).is(':checked');
		thisRow.data(newRowData);
		dt.draw();
	});
	$('#add-budget-table').on('click', 'input.add-budget-calculate:enabled', function(event) {
		const dt = $('#add-budget-table').DataTable();
		const thisRow = dt.row($(this).closest('tr'));
		const thisRowData = thisRow.data();
		let newRowData = thisRowData;
		newRowData['autoCalculate'] = $(this).is(':checked');
		thisRow.data(newRowData);
		dt.draw();
	});

	
	/********** Update Sums in Add Modal Every Few Seconds **********/
	var typingTimer;                //timer identifier
	// https://stackoverflow.com/questions/4220126/run-javascript-function-when-user-finishes-typing-instead-of-on-key-up
	$('#add-budget-table').on('change keyup', 'input.add-budget-value:enabled', function(event) {
			clearTimeout(typingTimer);
			typingTimer = setTimeout(function() {
				console.log('Done typing');
				const dt = $('#add-budget-table').DataTable();
				const thisRow = dt.row($(this).closest('tr'));
				const thisRowData = thisRow.data();
				let newRowData = thisRowData;
				newRowData['monthly_budget'] = Number($(this).val());
				newRowData['validValue'] = (typeof(newRowData['monthly_budget']) === 'number' && !isNaN(newRowData['monthly_budget']));
				thisRow.data(newRowData);
				// console.log(thisRowData);
				
				const thisId = thisRow.index()
				const lastIndex = dt.rows().count() - 1
				// Get any ancestors
				seq(0, thisId).filter(i => dt.row(i).data().descendants.includes(thisRowData.id))
				.sort((a, b) => dt.row(a).data().nest_level > dt.row(b).data().nest_level ? -1 : 1)
				// Iterate through ancestors (in reverse order of nest_level) and add through descendants
				.forEach(function(i) {
					const parentId = dt.row(i).data().id;
					// console.log('parentId', parentId);
					let newRowData = dt.row(i).data();
					// Iterate through and get any rows which are direct descendants
					const res = seq(0, lastIndex).filter(j => dt.row(j).data().parent == parentId).map(j => Number(dt.row(j).data().monthly_budget) || 0);
					newRowData['monthly_budget'] = res.reduce((a, b) => a + b);
					newRowData['validValue'] =  (typeof(newRowData['monthly_budget']) === 'number' && !isNaN(newRowData['monthly_budget']));
					// console.log(res);
					dt.row(i).data(newRowData);
				});
				
			}.bind(this), 1000); // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_objects/Function/bind 
			// Also set done Typing Interval here
	});
	

	/********** Attach Event Listener to New Budget - Validation & Submit **********/
	$('#add-budget-submit').on('click', function() {
		console.log('Submitted');
		const form = $(this).closest('form');
		form.find('.invalid-feedback').hide().text('');
		
		// Validate monthly budget values are numeric
		const dtData = $('#add-budget-table').DataTable().rows().data().toArray();
		console.log(dtData);
		const valid_values = dtData.every(x => (typeof(Number(x.monthly_budget)) === 'number' && !isNaN(Number(x.monthly_budget))));
		console.log(dtData.map(x => x.monthly_budget));
		if (!valid_values) {
			form.find('.invalid-feedback').text('Non-numeric values in monthly budget').show();
			return;
		}
		
		const ids_budgets = dtData.map(x => ({id: x.id, monthly_budget: x.monthly_budget}));
		console.log(ids_budgets);
		

		// Send to SQL 
		getAJAX('editAccountBudgets', toScript = ['updatedAccounts'], fromAjax = {ids_budgets: ids_budgets}).done(function(ajaxRes) {
		console.log(ajaxRes);
			if (JSON.parse(ajaxRes).updatedAccounts >= 1) {
				$('#add-budget-modal').modal('hide');
				$('div.overlay').show();
				init(_addDefaultState = function(newData) {
					return {page: {loadInstance: 1}};
				}, true).done((userData) => updateUi(userData));
			} else {
				form.find('.invalid-feedback').text('SQL Error').show();
			}
		});

		
	});


});


function updateUi(userData) {
	drawTable($('#add-budget-table'), userData.accounts, userData.dailyBals, userData.page.loadInstance);
	$('div.overlay').hide();
}



function drawTable(tbl, accounts, dailyBals, loadInstance) {
	
	// Include all expense data
	const dtData =
		accounts
		.filter(x => x.name_path.includes('Expenses'))
		.map(account => 
			({...account, ... {
				childrenState: account.descendants.length > 0 ? (account.id_path.length <= 1 ? 1 : 0) : -1,
				includeInBudget: account.is_open === true ? true : false,
				autoCalculate: account.descendants.length > 0 ? true : false,
				monthly_budget: account.monthly_budget || 0,
				validValue: true
			}})
		);
			
	// console.log('dtData', dtData);

	if (loadInstance === 0) {
		// On load, sets the initial data -> data gets pushed to table -> table renders data including +/- -> table conducts initial filtration
		// On click, edits table data -> table renders data including +/- -> table conducts initial filtration

		const dtCols =
			[
				{title: 'Row Number', data: 'full_order'},
				{title: 'Children State', data: 'childrenState'},
				{title: 'Nest Level', data: 'nest_level'},
				{title: 'Descendants', data: 'descendants'},
				{title: 'Account', data: null},
				{title: 'Include In Budget', data: 'includeInBudget'},
				{title: 'Auto-Calculate', data: 'autoCalculate'},
				{title: 'Monthly Budget', data: 'monthly_budget'},
				{title: 'Valid Value', data: 'validValue'},
				{title: '#', data: 'id'},
			].map(function(x, i) {
				return {...x, ...{
					visible: (!['Row Number', 'Descendants', 'Children State', 'Nest Level', 'Valid Value'].includes(x.title)),
					orderable: false,
					ordering: (x.title === 'Row Number' ? true : false),
					searchable: (x.title === 'Account'),
					type: (x.title === 'Account' ? 'html' : 'num'),
					className: (x.title === 'Account' ? 'dt-left' : 'dt-center'),
					render:
						x.title === 'Account' ? (data, type, row) => {
							return
							'<span style="padding-left: ' + Math.round((row.nest_level - 2) * 1) + 'rem">' +
							'<a style="font-size:0.90rem;font-weight:bold" href="transactions?account=' + row.id + '">' +
								row.name +
							'</a>';
						}
						: x.title === 'Include In Budget' ? (data, type, row) => (data === true ? '<input class="form-check-input add-budget-include" type="checkbox" checked>' : '<input class="form-check-input add-budget-include" type="checkbox">')
						: x.title === 'Auto-Calculate' ? (data, type, row) =>
							'<input class="form-check-input add-budget-calculate" type="checkbox" ' +
							(row.autoCalculate === true ? 'checked' : '') +
							(row.includeInBudget === true && row.descendants.length !== 0 ? '' : 'disabled') +
							'>'
						: x.title === 'Monthly Budget' ? (data, type, row) => 
							'<input type="text" class="form-control form-control-sm add-budget-value '+(row.validValue === true ? 'is-valid' : 'is-invalid') +'" value='+Number(data).toFixed(2)+' ' +
							(row.includeInBudget === true && row.autoCalculate === false ? '' : 'disabled') +
							'>'
						: false
				}};
			});
				
		const dt =
			tbl
			.DataTable({
				data: dtData,
				columns: dtCols,
				iDisplayLength: 1000,
				dom:
					"<'row'<'col-6 px-0 justify-content-start d-flex'><'col-6 px-0 justify-content-end d-flex'>>" +
					"<'row'<'px-0'tr>>" +
					"<'row'<'col-2'i><'col-10 justify-content-end d-flex px-0'B>>", // Flex display needed for right alignment
				buttons: [ // https://datatables.net/reference/option/buttons.buttons
					//{extend: 'copyHtml5', text: 'Copy to clipboard', exportOptions: {columns: seq(3, dtCols.length - 1)}, className: 'btn-sm btn-primary btn' },
					//{extend: 'csvHtml5', text: 'Export to CSV', exportOptions: {columns: seq(3, dtCols.length - 1)}, className: 'btn-sm btn-primary btn'}
					//{extend: 'excelHtml5', text: 'Export to Excel', exportOptions: {columns: seq(3, dtCols.length - 1)}, className: 'btn-sm'} requires jszip
				],
				order: [[0, 'asc']],
				language: {
					search: '',
					searchPlaceholder: 'Search by Account'
				},
				paging: false,
				info: false
				})
			.draw();
				
		dt.draw();

	} else if (loadInstance === 1) {
	
		const dt =
			tbl.DataTable()
			.clear()
			.rows.add(dtData) // Add new data
			.draw();
	}
	
	return true;
}

